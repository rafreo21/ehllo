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
        padding({ all: 8 }),
        widgetURL(deepLink),
      ]}>
      <VStack modifiers={[padding({ all: 4 })]}>
        {qrImageUri ? (
          <ZStack modifiers={[frame({ width: 120, height: 120 })]}>
            {/* fullColor so a tinted or clear widget appearance cannot recolour the code.
                The system desaturates full-colour images in those modes by default and can
                apply the person's chosen tint on top - and a QR that has lost its contrast
                will not scan, which is the entire job of this widget. */}
            <Image
              uiImage={qrImageUri}
              modifiers={[frame({ width: 120, height: 120 }), widgetAccentedRenderingMode('fullColor')]}
            />
            {props.logoImageUri ? (
              <Image
                uiImage={props.logoImageUri}
                modifiers={[frame({ width: 24, height: 24 }), cornerRadius(5), widgetAccentedRenderingMode('fullColor')]}
              />
            ) : null}
          </ZStack>
        ) : (
          <Text modifiers={[foregroundStyle(WIDGET_COLORS.accent), font({ weight: 'bold', size: 13 })]}>
            Scan to connect
          </Text>
        )}
      </VStack>
    </VStack>
  );
}

export default createWidget('QrScanWidget', QrScanWidget);
