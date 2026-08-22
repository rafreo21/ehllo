import { NativeModules, Platform } from 'react-native';

import { fetchAllConnections } from '@/features/connections/connections-api';
import { showsCompanyDetails } from '@/features/card/company-display';
import { shareCardDeepLink } from '@/features/card/share-deep-link';
import type { MobileCard } from '@/features/card/types';
import type { WidgetCardPayload, WidgetConnection, WidgetSnapshot } from '@/features/card/widget-types';
import { cacheWidgetPhotoUri, ensureWidgetLogoUri, readUriAsBase64 } from '@/lib/widget-assets';
import { readEnv } from '@/lib/env';
import { buildWidgetQrFileUri } from '@/lib/widget-qr';

export const CONNECTIONS_DEEP_LINK = 'ehllo://connections';

type WidgetBridge = {
  updateWidget?: (payload: Record<string, string | undefined>) => Promise<void>;
};

type IosWidgetPayload = Record<string, string | number | undefined>;

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
        } catch {
          // A missing avatar falls back to the initials circle, which is a real design state
          // rather than a failure - so this is not worth failing the whole sync over.
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
        photoImageUri,
        photoImageBase64,
      };
    }));
  } catch {
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
  } catch {
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
    } catch {
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

export async function buildWidgetSnapshot(
  cards: MobileCard[],
  cardPublicUrl: (card: MobileCard) => string,
  accessToken?: string,
  preferredCard?: MobileCard,
): Promise<WidgetSnapshot> {
  const env = readEnv();
  const published = cards.filter((card) => card.status === 'published' && card.slug);
  // The widget shows exactly one card: the one set as primary in the card home. It used to
  // send every published card so the widget could page between them, and took whichever one
  // happened to be first in the array as the headline - which is not necessarily the primary
  // one. There is no pager any more, so "primary" is the whole answer.
  //
  // preferredCard is only a hint: card-context passes the primary, but the card tools screen
  // passes whatever card you are looking at, so it must not outrank an explicit isPrimary.
  // Only a PUBLISHED PRIMARY card renders. No falling back to the first published card, to a
  // primary draft, or to whatever the card tools screen happened to pass: if there is no
  // published primary card there is nothing legitimate to put on a home screen, and the widget
  // shows its placeholder state instead of somebody else's card or an unpublished draft whose
  // QR would lead nowhere.
  const target = published.find((card) => card.isPrimary);
  const cardTargets = target ? [target] : [];

  let logoImageUri: string | undefined;
  let logoImageBase64: string | undefined;
  try {
    logoImageUri = await ensureWidgetLogoUri();
    if (logoImageUri) logoImageBase64 = await readUriAsBase64(logoImageUri);
  } catch {
    logoImageUri = undefined;
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
    } catch {
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
    signedIn: Boolean(accessToken),
  };
}

function bridgePayload(snapshot: WidgetSnapshot): Record<string, string | undefined> {
  const payload: Record<string, string | undefined> = {
    cardsJson: JSON.stringify(snapshot.cards),
    logoImageBase64: snapshot.logoImageBase64,
    connectionsDeepLink: snapshot.connectionsDeepLink,
    recentConnectionsJson: JSON.stringify(snapshot.connections),
    signedIn: snapshot.signedIn ? '1' : '0',
  };

  snapshot.connections.slice(0, 2).forEach((connection, index) => {
    const slot = index + 1;
    payload[`connection${slot}Name`] = connection.name;
    payload[`connection${slot}Subtitle`] = connection.subtitle;
    payload[`connection${slot}Phone`] = connection.phone;
    payload[`connection${slot}Email`] = connection.email;
    payload[`connection${slot}Initials`] = connection.initials;
    payload[`connection${slot}PhotoBase64`] = connection.photoImageBase64;
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
    logoImageUri: snapshot.logoImageUri,
    connectionsDeepLink: snapshot.connectionsDeepLink,
    shareDeepLink: primary?.shareDeepLink || 'ehllo://share-card',
    qrImageUri: primary?.qrImageUri || snapshot.qrImageUri,
    // Empty rather than demo text, so the widget can tell "no published primary card" apart
    // from a card that simply has no role or company set.
    name: primary?.name || '',
    role: primary?.role || '',
    company: primary?.company || '',
    initials: primary?.initials || '',
    photoImageUri: primary?.photoImageUri,
    // Crosses as a string because the bridge carries strings and numbers, not booleans. Its
    // absence means the widget gallery, where sample content is the right thing to show.
    signedIn: snapshot.signedIn ? '1' : '0',
  };

  snapshot.connections.slice(0, 2).forEach((connection, index) => {
    const slot = index + 1;
    payload[`connection${slot}Name`] = connection.name;
    payload[`connection${slot}Subtitle`] = connection.subtitle;
    payload[`connection${slot}Phone`] = connection.phone || '';
    payload[`connection${slot}Email`] = connection.email || '';
    payload[`connection${slot}Initials`] = connection.initials || '';
    payload[`connection${slot}PhotoUri`] = connection.photoImageUri || '';
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

export async function syncAllWidgets(
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
