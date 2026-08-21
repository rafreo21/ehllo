import { Image, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import { containerBackground, cornerRadius, font, foregroundStyle, frame, padding, widgetAccentedRenderingMode, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

type WidgetCardRecord = {
  name: string;
  role: string;
  company: string;
  cardUrl: string;
  shareDeepLink: string;
  initials: string;
  qrImageUri?: string;
  photoImageUri?: string;
};

export type QrScanWidgetProps = {
  shareDeepLink?: string;
  qrImageUri?: string;
  logoImageUri?: string;
  cardsJson?: string;
  /** '1' or '0'. Absent means the widget gallery, where sample content is the right answer. */
  signedIn?: string | boolean;
};

function QrScanWidget(props: QrScanWidgetProps) {
  'widget';

  // The 'widget' directive serializes only this function's own body text
  // for native evaluation - nothing from outer scope is captured, not even
  // plain constants. Every helper AND constant the render logic needs must
  // be declared inside this function.
  const WIDGET_COLORS = {
    canvas: '#141814',
    accent: '#9FE870',
    text: '#FFFFFF',
    muted: '#B8C4B3',
    subtle: '#8FA088',
  };

  const DEMO_CARD: WidgetCardRecord = {
    name: 'Alex Morgan',
    role: 'Product Designer',
    company: 'ehllo',
    cardUrl: 'https://ehllo.io/c/demo',
    shareDeepLink: 'ehllo://share-card',
    initials: 'AM',
  };

  function parseCardsJson(raw?: string): WidgetCardRecord[] {
    if (!raw?.trim()) return [DEMO_CARD];
    try {
      const parsed = JSON.parse(raw) as WidgetCardRecord[];
      if (!Array.isArray(parsed) || parsed.length === 0) return [DEMO_CARD];
      return parsed.map((card) => ({
        name: card.name?.trim() || DEMO_CARD.name,
        role: card.role?.trim() || '',
        company: card.company?.trim() || '',
        cardUrl: card.cardUrl?.trim() || DEMO_CARD.cardUrl,
        shareDeepLink: card.shareDeepLink?.trim() || DEMO_CARD.shareDeepLink,
        initials: card.initials?.trim() || DEMO_CARD.initials,
        qrImageUri: card.qrImageUri,
        photoImageUri: card.photoImageUri,
      }));
    } catch {
      return [DEMO_CARD];
    }
  }

  function activeCard(cards: WidgetCardRecord[], index: number) {
    if (!cards.length) return DEMO_CARD;
    return cards[index % cards.length] ?? cards[0] ?? DEMO_CARD;
  }

  const cards = parseCardsJson(props.cardsJson);
  const card = activeCard(cards, 0);
  const deepLink = card.shareDeepLink || props.shareDeepLink || 'ehllo://share-card';
  const qrImageUri = card.qrImageUri || props.qrImageUri;

  return (
    <VStack
      modifiers={[
        containerBackground(WIDGET_COLORS.canvas, 'widget'),
        // 16pt is the standard widget margin in Apple's guidance - "to avoid crowding their
        // edges and creating a cluttered appearance". This was 8 plus an inner 4, and with a
        // fixed 120pt code that needed 144pt of width: a small widget on the smallest iPhones
        // is about 141pt, so the code was being clipped there.
        padding({ all: 16 }),
        widgetURL(deepLink),
      ]}>
        {qrImageUri ? (
          // 104 rather than 120. A small widget is about 141pt across on the smallest
          // iPhones, and 16pt margins on both sides leave 109pt - so this is the largest
          // square that fits every device without being clipped, instead of the largest that
          // fits the device it was designed on.
          <ZStack modifiers={[frame({ width: 104, height: 104 })]}>
            {/* fullColor so a tinted or clear widget appearance cannot recolour the code.
                The system desaturates full-colour images in those modes by default and can
                apply the person's chosen tint on top - and a QR that has lost its contrast
                will not scan, which is the entire job of this widget. */}
            <Image
              uiImage={qrImageUri}
              modifiers={[frame({ width: 104, height: 104 }), widgetAccentedRenderingMode('fullColor')]}
            />
            {props.logoImageUri ? (
              <Image
                uiImage={props.logoImageUri}
                modifiers={[frame({ width: 24, height: 24 }), cornerRadius(5), widgetAccentedRenderingMode('fullColor')]}
              />
            ) : null}
          </ZStack>
        ) : (
          // Said plainly instead of "Scan to connect", which promised a code that was not
          // there. Apple's guidance is explicit that a widget needing an account should say
          // so; the signed-out wording is theirs in spirit - "Sign in to view reservations".
          <Text modifiers={[foregroundStyle(WIDGET_COLORS.accent), font({ weight: 'bold', size: 13 })]}>
            {props.signedIn === '0' || props.signedIn === false
              ? 'Sign in to share your card'
              : 'Open ehllo to set up your card'}
          </Text>
        )}
    </VStack>
  );
}

export default createWidget('QrScanWidget', QrScanWidget);
