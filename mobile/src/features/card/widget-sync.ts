import { NativeModules, Platform } from 'react-native';

import { fetchAllConnections } from '@/features/connections/connections-api';
import { showsCompanyDetails } from '@/features/card/company-display';
import { shareCardDeepLink } from '@/features/card/share-deep-link';
import type { MobileCard } from '@/features/card/types';
import type { WidgetCardPayload, WidgetConnection, WidgetSnapshot } from '@/features/card/widget-types';
import { WIDGET_DEMO_CARD } from '@/features/card/widget-types';
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

async function loadRecentConnections(accessToken?: string): Promise<WidgetConnection[]> {
  if (!accessToken) return [];
  try {
    const connections = await fetchAllConnections(accessToken);
    return connections.slice(0, 3).map((connection) => ({
      name: connection.name,
      subtitle: connection.subtitle,
      phone: connection.phone,
      email: connection.email,
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
  const cardTargets = published.length
    ? published
    : preferredCard
      ? [preferredCard]
      : cards.slice(0, 1);

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
  };
}

function bridgePayload(snapshot: WidgetSnapshot): Record<string, string | undefined> {
  const payload: Record<string, string | undefined> = {
    cardsJson: JSON.stringify(snapshot.cards),
    logoImageBase64: snapshot.logoImageBase64,
    connectionsDeepLink: snapshot.connectionsDeepLink,
    recentConnectionsJson: JSON.stringify(snapshot.connections),
  };

  snapshot.connections.slice(0, 3).forEach((connection, index) => {
    const slot = index + 1;
    payload[`connection${slot}Name`] = connection.name;
    payload[`connection${slot}Subtitle`] = connection.subtitle;
    payload[`connection${slot}Phone`] = connection.phone;
    payload[`connection${slot}Email`] = connection.email;
  });

  return payload;
}

async function ensureDemoCardQr(cards: WidgetCardPayload[]) {
  if (cards.length) return cards;
  try {
    const demoQrUri = await buildWidgetQrFileUri(WIDGET_DEMO_CARD.cardUrl, 'demo');
    return [{ ...WIDGET_DEMO_CARD, qrImageUri: demoQrUri }];
  } catch {
    return [WIDGET_DEMO_CARD];
  }
}

function iosWidgetPayload(snapshot: WidgetSnapshot): IosWidgetPayload {
  const cards = snapshot.cards.length ? snapshot.cards : [WIDGET_DEMO_CARD];
  const primary = cards[0];

  const payload: IosWidgetPayload = {
    cardsJson: JSON.stringify(cards),
    cardIndex: 0,
    logoImageUri: snapshot.logoImageUri,
    connectionsDeepLink: snapshot.connectionsDeepLink,
    shareDeepLink: primary?.shareDeepLink || WIDGET_DEMO_CARD.shareDeepLink,
    qrImageUri: primary?.qrImageUri || snapshot.qrImageUri,
    name: primary?.name || WIDGET_DEMO_CARD.name,
    role: primary?.role || WIDGET_DEMO_CARD.role,
    company: primary?.company || WIDGET_DEMO_CARD.company,
    initials: primary?.initials || WIDGET_DEMO_CARD.initials,
    photoImageUri: primary?.photoImageUri,
  };

  snapshot.connections.slice(0, 3).forEach((connection, index) => {
    const slot = index + 1;
    payload[`connection${slot}Name`] = connection.name;
    payload[`connection${slot}Subtitle`] = connection.subtitle;
    payload[`connection${slot}Phone`] = connection.phone || '';
    payload[`connection${slot}Email`] = connection.email || '';
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
  const cards = await ensureDemoCardQr(snapshot.cards);
  const payload = iosWidgetPayload({ ...snapshot, cards });

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
  if (platform === 'android') {
    return 'Long-press your home screen → Widgets → ehllo. Add QR Scan (2×2), Business Card, or Recent Connections. Swipe cards with ‹ › on the business card widget.';
  }
  return 'Long-press your home screen → Edit → Add Widget → ehllo. Add QR Scan, Business Card, or Recent Connections. Use ‹ › on the business card widget to switch cards.';
}
