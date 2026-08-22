import { NativeModules, Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';

import { fetchAllConnections } from '@/features/connections/connections-api';
import { showsCompanyDetails } from '@/features/card/company-display';
import { isPreviewCard } from '@/features/card/default-card';
import { shareCardDeepLink } from '@/features/card/share-deep-link';
import type { MobileCard } from '@/features/card/types';
import type { WidgetCardPayload, WidgetConnection, WidgetSnapshot } from '@/features/card/widget-types';
import { cacheWidgetPhotoUri, ensureWidgetLogoUri, readUriAsBase64 } from '@/lib/widget-assets';
import { appDeepLink } from '@/lib/app-scheme';
import { readEnv } from '@/lib/env';
import { buildWidgetQrFileUri } from '@/lib/widget-qr';
import { buildFollowUpMailto } from '@/features/follow-ups/action-links';

export const CONNECTIONS_DEEP_LINK = appDeepLink('connections');
export const SCANNER_DEEP_LINK = appDeepLink('scanner');

type WidgetBridge = {
  updateWidget?: (payload: Record<string, string | undefined>) => Promise<void>;
};

type IosWidgetPayload = Record<string, string | number | undefined>;

/**
 * Every QR/photo/logo asset step below is intentionally best-effort - a missing avatar falls
 * back to initials, a missing QR falls back to "Publish your card", and none of that is worth
 * failing the whole widget sync over. But "worth degrading gracefully" and "worth knowing
 * about" are different questions, and until now these caught silently: no console line, no
 * Sentry event, nothing. That is exactly the shape of failure a real device hit - a real,
 * published card with a real QR file on disk, but qrImageUri missing from the synced snapshot
 * anyway - and it stayed invisible because the code succeeding at the sync while quietly
 * losing one asset looked, from every log available, identical to nothing going wrong at all.
 * `warning`, not `error`: the sync itself still succeeds, so this should never look like an
 * outage on its own - only a pattern across many of these should.
 */
function reportWidgetAssetFailure(step: string, caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught);
  console.warn(`[widget-sync] ${step} failed`, { message });
  Sentry.captureException(caught instanceof Error ? caught : new Error(message), {
    level: 'warning',
    tags: { widget_asset_step: step },
  });
}

function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'AM';
}

function widgetAssetKey(card: MobileCard, index: number) {
  return card.id || card.slug || `card-${index}`;
}

// "Connected 2 mins ago" rather than "Shared via your card" - the widget's job is to show who
// you met and how recently, and the old subtitle said the same thing on every row.
function connectedAgo(connectedAt?: string) {
  if (!connectedAt) return 'Connected through ehllo';
  const then = Date.parse(connectedAt);
  if (!Number.isFinite(then)) return 'Connected through ehllo';
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'Connected just now';
  if (minutes < 60) return `Connected ${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Connected ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Connected ${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Connected ${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `Connected ${months} month${months === 1 ? '' : 's'} ago`;
}

// The follow-up the widget's envelope should draft. A widget tap that lands you in an empty
// compose window has done almost nothing useful; naming where you met is the part nobody
// remembers to write.
//
// This used to hand-roll its own subject/body, which read close to but not exactly like the
// email the app itself sends for the same action ("Hi" vs "Hey", a subject that embedded the
// event when the app's never does, no sign-off). The widget and the app must produce the
// same email for the same tap - online or offline, from a home screen or from the connection
// screen - so this calls the same builder the app uses rather than keeping a second copy that
// only drifts from it.
function followUpMailUrl(name: string, email?: string, eventTitle?: string) {
  const address = email?.trim();
  if (!address) return undefined;
  return buildFollowUpMailto(address, name, eventTitle) || undefined;
}

// Two, not three: the layout has room for two rows plus an action, and every extra row costs a
// photo download and a cache write for something that would not be drawn.
async function loadRecentConnections(accessToken?: string): Promise<WidgetConnection[]> {
  if (!accessToken) return [];
  try {
    const connections = await fetchAllConnections(accessToken);
    return await Promise.all(connections.slice(0, 2).map(async (connection, index) => {
      let photoImageUri: string | undefined;
      let photoImageBase64: string | undefined;
      if (connection.photoUrl?.trim()) {
        try {
          const cached = await cacheWidgetPhotoUri(connection.photoUrl, `connection-${connection.id || index}`);
          if (cached) {
            photoImageUri = cached;
            if (Platform.OS === 'android') photoImageBase64 = await readUriAsBase64(cached);
          }
        } catch (caught) {
          // A missing avatar falls back to the initials circle, which is a real design state
          // rather than a failure - so this is not worth failing the whole sync over.
          reportWidgetAssetFailure('connection photo', caught);
          photoImageUri = undefined;
          photoImageBase64 = undefined;
        }
      }
      return {
        name: connection.name,
        subtitle: connectedAgo(connection.connectedAt),
        phone: connection.phone,
        email: connection.email,
        initials: initialsFor(connection.name),
        // Tapping the person opens that person, not the whole list.
        profileDeepLink: connection.id ? appDeepLink(`connections/${connection.id}`) : undefined,
        followUpMailUrl: followUpMailUrl(connection.name, connection.email, connection.eventTitle),
        photoImageUri,
        photoImageBase64,
      };
    }));
  } catch (caught) {
    reportWidgetAssetFailure('load connections', caught);
    return [];
  }
}

async function buildWidgetCardPayload(
  card: MobileCard,
  cardUrl: string,
  assetKey: string,
): Promise<WidgetCardPayload> {
  const showCompany = showsCompanyDetails(card);
  let qrImageBase64: string | undefined;
  let photoImageBase64: string | undefined;
  let qrImageUri: string | undefined;
  let photoImageUri: string | undefined;

  try {
    const qrImageUriValue = await buildWidgetQrFileUri(cardUrl, assetKey);
    if (qrImageUriValue) {
      qrImageUri = qrImageUriValue;
      if (Platform.OS === 'android') {
        qrImageBase64 = await readUriAsBase64(qrImageUriValue);
      }
    }
  } catch (caught) {
    reportWidgetAssetFailure('card QR', caught);
    qrImageBase64 = undefined;
    qrImageUri = undefined;
  }

  if (card.photo?.trim()) {
    try {
      const cachedPhotoUri = await cacheWidgetPhotoUri(card.photo, assetKey);
      if (cachedPhotoUri) {
        photoImageUri = cachedPhotoUri;
        if (Platform.OS === 'android') {
          photoImageBase64 = await readUriAsBase64(cachedPhotoUri);
        }
      }
    } catch (caught) {
      reportWidgetAssetFailure('card photo', caught);
      photoImageBase64 = undefined;
      photoImageUri = undefined;
    }
  }

  return {
    name: card.name.trim() || 'My card',
    role: card.role.trim(),
    company: showCompany ? card.company.trim() : '',
    cardUrl,
    shareDeepLink: shareCardDeepLink(card),
    qrImageBase64,
    photoImageBase64,
    qrImageUri,
    photoImageUri,
    initials: initialsFor(card.name),
  };
}

// Serializes every call that reaches buildWidgetQrFileUri/cacheWidgetPhotoUri, not just
// syncAllWidgets. card-tool-sheets.tsx's "Home screen widgets" preview sheet calls
// buildWidgetSnapshotImpl directly, for its own live preview - a second, independent entry
// point into the exact same shared resources: the single-item requestQrDataUrl queue
// (widget-qr-renderer.tsx, 4s timeout per item) and the same deterministic QR/photo file
// paths (assetKey is the card id, so the preview and the real sync target the identical
// filename). A widget-sync-only lock left this one uncovered: on a cold launch the preview's
// own snapshot build was observed racing the real one for the same QR slot, and whichever
// finished last overwrote UserDefaults - sometimes with the preview's own failed/undefined
// qrImageUri, on a card that files on disk prove really did get a QR moments earlier from the
// call that lost the write race. Locking here, at the shared resource itself, covers both
// entry points instead of only the one that happened to be found first.
let snapshotChain: Promise<unknown> = Promise.resolve();

export function buildWidgetSnapshot(
  cards: MobileCard[],
  cardPublicUrl: (card: MobileCard) => string,
  accessToken?: string,
  preferredCard?: MobileCard,
): Promise<WidgetSnapshot> {
  const run = snapshotChain.then(() => buildWidgetSnapshotImpl(cards, cardPublicUrl, accessToken, preferredCard));
  snapshotChain = run.then(() => undefined, () => undefined);
  return run;
}

async function buildWidgetSnapshotImpl(
  cards: MobileCard[],
  cardPublicUrl: (card: MobileCard) => string,
  accessToken?: string,
  preferredCard?: MobileCard,
): Promise<WidgetSnapshot> {
  const env = readEnv();
  const signedIn = Boolean(accessToken);
  // Preview cards are excluded HERE, at the widget boundary, not just by the callers.
  //
  // defaultCard is a sample used to populate the UI before someone has a real card. It is
  // marked status:'published' with slug 'alex-morgan', so it satisfies every test for "a real
  // published card" - and card-context filters it in five places for the UI and for remote
  // sync, but nothing filtered it on the way to the widget. A user carrying it got Alex
  // Morgan's name on their home screen with a QR pointing at /c/alex-morgan, or, while the
  // primary lookup had no fallback, a blank white widget. Both reported symptoms, one cause.
  //
  // Filtering at the boundary rather than trusting the caller: the widget is the thing with a
  // stranger's identity on a home screen if this is ever wrong again.
  // Local card state can outlive a session. Never serialize it while signed out: otherwise a
  // shared device can keep showing the previous account's name, photo and public QR after
  // logout. The explicit signed-out snapshot is also what clears those values natively.
  const real = signedIn ? cards.filter((card) => !isPreviewCard(card)) : [];
  const published = real.filter((card) => card.status === 'published' && card.slug);
  // The widget shows exactly one card: the one set as primary in the card home. It used to
  // send every published card so the widget could page between them, and took whichever one
  // happened to be first in the array as the headline - which is not necessarily the primary
  // one. There is no pager any more, so "primary" is the whole answer.
  //
  // preferredCard is only a hint: card-context passes the primary, but the card tools screen
  // passes whatever card you are looking at, so it must not outrank an explicit isPrimary.
  // Prefer the PUBLISHED PRIMARY card, but never show nothing when the person has a published
  // card.
  //
  // This briefly had no fallback at all, and it shipped: `published.find(c => c.isPrimary)`
  // alone. isPrimary comes from the server's is_primary column, and any account where that was
  // never set - older accounts, or ones where set_primary_card never ran - has no primary card
  // at all. Those users got no card in the payload and a blank white placeholder on their home
  // screen, with their published card sitting right there. It passed testing because this
  // device's account HAS is_primary set: card-context reconciles it on sync, so the one account
  // it was tested on was the one account that could not hit the bug.
  //
  // An unpublished draft is still refused - its QR would lead nowhere - so the placeholder is
  // reserved for people who genuinely have nothing published.
  const target = published.find((card) => card.isPrimary) || published[0];
  const cardTargets = target ? [target] : [];

  let logoImageUri: string | undefined;
  let logoImageBase64: string | undefined;
  if (signedIn) {
    try {
      logoImageUri = await ensureWidgetLogoUri();
      if (logoImageUri) logoImageBase64 = await readUriAsBase64(logoImageUri);
    } catch (caught) {
      reportWidgetAssetFailure('logo', caught);
      logoImageUri = undefined;
    }
  }

  const widgetCards = await Promise.all(
    cardTargets.map(async (card, index) => {
      const resolvedUrl = cardPublicUrl(card)
        || `${env?.publicCardBaseUrl || 'https://ehllo.io'}/c/${card.slug || 'demo'}`;
      return buildWidgetCardPayload(card, resolvedUrl, widgetAssetKey(card, index));
    }),
  );

  const primary = widgetCards[0];
  let qrImageUri: string | undefined = primary?.qrImageUri;
  if (!qrImageUri && primary?.cardUrl) {
    try {
      qrImageUri = await buildWidgetQrFileUri(primary.cardUrl, 'primary');
    } catch (caught) {
      reportWidgetAssetFailure('primary QR fallback', caught);
      qrImageUri = undefined;
    }
  }

  return {
    cards: widgetCards,
    connectionsDeepLink: CONNECTIONS_DEEP_LINK,
    connections: await loadRecentConnections(accessToken),
    logoImageUri,
    logoImageBase64,
    qrImageUri,
    // Whether there is a signed-in account behind this snapshot. The widget used to fall back
    // to the demo card when it had nothing, so a signed-out home screen advertised Alex
    // Morgan's details as though they were yours, with a QR pointing at a demo page.
    signedIn,
  };
}

function bridgePayload(snapshot: WidgetSnapshot): Record<string, string | undefined> {
  const payload: Record<string, string | undefined> = {
    cardsJson: JSON.stringify(snapshot.cards),
    // The native bridge persists a key/value store. Send empty values deliberately so logout,
    // removed photos and fewer connections replace the previous snapshot instead of merging
    // with stale personal data.
    logoImageBase64: snapshot.logoImageBase64 || '',
    connectionsDeepLink: snapshot.connectionsDeepLink,
    // Sent explicitly rather than hardcoded natively: the scheme differs per variant
    // (ehllo-staging vs ehllo), and a native default cannot know which build it is in.
    scannerDeepLink: SCANNER_DEEP_LINK,
    recentConnectionsJson: JSON.stringify(snapshot.connections),
    signedIn: snapshot.signedIn ? '1' : '0',
  };

  for (const slot of [1, 2]) {
    payload[`connection${slot}Name`] = '';
    payload[`connection${slot}Subtitle`] = '';
    payload[`connection${slot}Phone`] = '';
    payload[`connection${slot}Email`] = '';
    payload[`connection${slot}Initials`] = '';
    payload[`connection${slot}PhotoBase64`] = '';
    payload[`connection${slot}Profile`] = '';
    payload[`connection${slot}Mail`] = '';
  }

  snapshot.connections.slice(0, 2).forEach((connection, index) => {
    const slot = index + 1;
    payload[`connection${slot}Name`] = connection.name;
    payload[`connection${slot}Subtitle`] = connection.subtitle;
    payload[`connection${slot}Phone`] = connection.phone;
    payload[`connection${slot}Email`] = connection.email;
    payload[`connection${slot}Initials`] = connection.initials;
    payload[`connection${slot}PhotoBase64`] = connection.photoImageBase64;
    payload[`connection${slot}Profile`] = connection.profileDeepLink;
    payload[`connection${slot}Mail`] = connection.followUpMailUrl;
  });

  return payload;
}

// No demo card is substituted any more. A snapshot with no cards means there is no published
// primary card, and the widget has a placeholder state for exactly that - so filling the gap
// with Alex Morgan's details here would hide the state the widget is meant to show, and put a
// QR pointing at a demo page on a real home screen. The widget gallery reaches the widget with
// no snapshot at all, which is a different path and still shows sample content.
function iosWidgetPayload(snapshot: WidgetSnapshot): IosWidgetPayload {
  const cards = snapshot.cards;
  const primary = cards[0];

  const payload: IosWidgetPayload = {
    cardsJson: JSON.stringify(cards),
    cardIndex: 0,
    logoImageUri: snapshot.logoImageUri || '',
    connectionsDeepLink: snapshot.connectionsDeepLink,
    scannerDeepLink: SCANNER_DEEP_LINK,
    shareDeepLink: primary?.shareDeepLink || appDeepLink('share-card'),
    qrImageUri: primary?.qrImageUri || snapshot.qrImageUri || '',
    // Empty rather than demo text, so the widget can tell "no published primary card" apart
    // from a card that simply has no role or company set.
    name: primary?.name || '',
    role: primary?.role || '',
    company: primary?.company || '',
    initials: primary?.initials || '',
    photoImageUri: primary?.photoImageUri || '',
    // Crosses as a string because the bridge carries strings and numbers, not booleans. Its
    // absence means the widget gallery, where sample content is the right thing to show.
    signedIn: snapshot.signedIn ? '1' : '0',
  };

  for (const slot of [1, 2]) {
    payload[`connection${slot}Name`] = '';
    payload[`connection${slot}Subtitle`] = '';
    payload[`connection${slot}Phone`] = '';
    payload[`connection${slot}Email`] = '';
    payload[`connection${slot}Initials`] = '';
    payload[`connection${slot}PhotoUri`] = '';
    payload[`connection${slot}Profile`] = '';
    payload[`connection${slot}Mail`] = '';
  }

  snapshot.connections.slice(0, 2).forEach((connection, index) => {
    const slot = index + 1;
    payload[`connection${slot}Name`] = connection.name;
    payload[`connection${slot}Subtitle`] = connection.subtitle;
    payload[`connection${slot}Phone`] = connection.phone || '';
    payload[`connection${slot}Email`] = connection.email || '';
    payload[`connection${slot}Initials`] = connection.initials || '';
    payload[`connection${slot}PhotoUri`] = connection.photoImageUri || '';
    payload[`connection${slot}Profile`] = connection.profileDeepLink || '';
    payload[`connection${slot}Mail`] = connection.followUpMailUrl || '';
  });

  return payload;
}

/**
 * Thrown only when the widget target genuinely is not in this build.
 *
 * It exists so that one failure can be told apart from every other one. The caller used to
 * catch everything and report "install a development or production build", so a QR that would
 * not render, a photo that would not cache, or a snapshot the extension refused looked
 * identical to running in Expo Go - and there was no way to find out which.
 */
class WidgetTargetMissingError extends Error {}

async function updateIosWidgets(snapshot: WidgetSnapshot) {
  // Loaded before anything else is prepared, and on its own, because this is the only step
  // whose failure means the app needs rebuilding.
  let modules;
  try {
    modules = await Promise.all([
      import('../../../widgets/QrScanWidget'),
      import('../../../widgets/BusinessCardWidget'),
      import('../../../widgets/RecentConnectionsWidget'),
    ]);
  } catch (caught) {
    throw new WidgetTargetMissingError(
      caught instanceof Error ? caught.message : 'widget modules unavailable',
    );
  }

  const [{ default: qrScan }, { default: businessCard }, { default: recentConnections }] = modules;
  // Present but inert is the same situation as absent: the JS shim resolves in Expo Go while
  // the native extension it talks to does not exist.
  if (typeof qrScan?.updateSnapshot !== 'function'
    || typeof businessCard?.updateSnapshot !== 'function'
    || typeof recentConnections?.updateSnapshot !== 'function') {
    throw new WidgetTargetMissingError('widget modules loaded without updateSnapshot');
  }

  // Anything below here is a real failure and is allowed to say so.
  const payload = iosWidgetPayload(snapshot);

  qrScan.updateSnapshot(payload);
  businessCard.updateSnapshot(payload);
  recentConnections.updateSnapshot(payload);
}

// Serializes calls to performSyncAllWidgets so two syncs can never run at once. They used to:
// card-context.tsx fires one on every card-list persist (including on every app launch) and
// again on publish; card-tools.tsx fires one from an effect too. Two overlapping calls each
// build their own widget snapshot independently, and the *second one to finish* wins - it
// overwrites the App Group entirely, including any card the first call already wrote.
//
// QR generation makes this land on the QR specifically, not photos: requestQrDataUrl
// (widget-qr-renderer.tsx) is a single global queue with a 4s-per-item timeout, shared by
// every sync in flight. Two concurrent syncs queue their QR requests behind each other, and
// on a busy app launch (bundling, hydration, image loads) the second request can miss the 4s
// window and reject. That call's snapshot then has a real card - name, role, photo all
// present - with qrImageUri simply absent, because JSON.stringify drops undefined keys. If it
// finishes writing after the sync that DID get a QR, its card-without-a-QR becomes the one the
// widget reads, even though a valid QR file is still sitting on disk from the sync that won
// the race the other way. That is "Publish your card" / "Open ehllo to set up your card" on a
// card that is, in fact, published - confirmed by reading the actual App Group plist: cardsJson
// held a real name, role and photo with no qrImageUri key at all, while a QR file from a
// separate, successful sync moments earlier sat unreferenced right next to it.
let widgetSyncChain: Promise<void> = Promise.resolve();

export function syncAllWidgets(
  cards: MobileCard[],
  cardPublicUrl: (card: MobileCard) => string,
  accessToken?: string,
  preferredCard?: MobileCard,
) {
  // buildWidgetSnapshot (called inside performSyncAllWidgets) already serializes against
  // every caller, preview included - see snapshotChain above. This second lock additionally
  // orders the native updateIosWidgets/bridge.updateWidget write step across concurrent real
  // syncs specifically, so the last one to reach that step is always the one with the
  // freshest snapshot, not whichever happened to finish its own snapshot build first.
  const run = widgetSyncChain.then(() => performSyncAllWidgets(cards, cardPublicUrl, accessToken, preferredCard));
  widgetSyncChain = run.then(() => undefined, () => undefined);
  return run;
}

async function performSyncAllWidgets(
  cards: MobileCard[],
  cardPublicUrl: (card: MobileCard) => string,
  accessToken?: string,
  preferredCard?: MobileCard,
) {
  const snapshot = await buildWidgetSnapshot(cards, cardPublicUrl, accessToken, preferredCard);

  if (Platform.OS === 'ios') {
    try {
      await updateIosWidgets(snapshot);
      return;
    } catch (caught) {
      if (caught instanceof WidgetTargetMissingError) {
        throw new Error('The home-screen widget is available after installing a development or production build.');
      }
      // Said out loud, and passed on rather than replaced. Every failure used to be reported
      // as a missing build, which is why "the widget export is not working" came with nothing
      // to go on.
      console.error('[widget-sync] iOS widget update failed', {
        message: caught instanceof Error ? caught.message : String(caught),
      });
      Sentry.captureException(caught instanceof Error ? caught : new Error(String(caught)), {
        tags: { widget_sync_platform: 'ios' },
      });
      throw caught instanceof Error
        ? new Error(`The widget could not be updated: ${caught.message}`)
        : new Error('The widget could not be updated.');
    }
  }

  if (Platform.OS === 'android') {
    const bridge = NativeModules.QuickShareWidgetBridge as WidgetBridge | undefined;
    if (!bridge?.updateWidget) {
      throw new Error('Rebuild the Android app to enable the home-screen widget.');
    }
    try {
      await bridge.updateWidget(bridgePayload(snapshot));
    } catch (caught) {
      // The bridge exists, so this is a real failure on the native side rather than a missing
      // build, and it should not be reported as one.
      console.error('[widget-sync] Android widget update failed', {
        message: caught instanceof Error ? caught.message : String(caught),
      });
      Sentry.captureException(caught instanceof Error ? caught : new Error(String(caught)), {
        tags: { widget_sync_platform: 'android' },
      });
      throw caught instanceof Error
        ? new Error(`The widget could not be updated: ${caught.message}`)
        : new Error('The widget could not be updated.');
    }
    return;
  }

  throw new Error('Home-screen widgets are only available on iPhone and Android.');
}

export async function updateQuickShareWidget(
  card: MobileCard,
  publicUrl: string,
  accessToken?: string,
  allCards: MobileCard[] = [card],
  cardPublicUrl?: (item: MobileCard) => string,
) {
  const env = readEnv();
  const urlFn = cardPublicUrl || ((item: MobileCard) => {
    if (item.id === card.id && publicUrl) return publicUrl;
    return `${env?.publicCardBaseUrl || 'https://ehllo.io'}/c/${item.slug}`;
  });
  await syncAllWidgets(allCards, urlFn, accessToken, card);
}

export function widgetSetupInstructions(platform: 'ios' | 'android') {
  // Just the path to the widget picker. The three widgets are named and pictured in the
  // gallery directly below this line, so listing them here said everything twice.
  if (platform === 'android') {
    return 'Long-press the home screen → Widgets → ehllo.';
  }
  return 'Long-press the home screen → Edit → Add Widget → ehllo.';
}
