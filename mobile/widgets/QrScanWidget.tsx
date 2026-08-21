import { Image, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import { aspectRatio, background, containerBackground, cornerRadius, font, foregroundStyle, frame, padding, resizable, widgetAccentedRenderingMode, widgetURL } from '@expo/ui/swift-ui/modifiers';
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
        // 11pt, which Apple sanctions as the tighter margin "to create content groupings" -
        // and a scannable code is exactly that. The standard 16 left the code smaller than it
        // needs to be for the one job this widget has.
        padding({ all: 11 }),
        widgetURL(deepLink),
      ]}>
        {qrImageUri ? (
          // A white card under the code, matching the QR screen in the app - and it earns its
          // place technically as well as visually: the padding around the code is the quiet
          // zone a scanner needs to find the symbol, which a code flush against a dark
          // background does not have.
          //
          // The sums, so this cannot silently clip again: the widget is 164pt here and about
          // 141pt on the smallest iPhones. 11pt outer margins leave 119pt there, the card's
          // own 8pt padding takes 16 more, so a 100pt code is the largest that fits every
          // device. The card itself is then 116pt - about 71% of the widget, up from 63%.
          <ZStack
            modifiers={[
              frame({ width: 116, height: 116 }),
              background('#FFFFFF'),
              cornerRadius(18),
            ]}>
            {/* fullColor so a tinted or clear widget appearance cannot recolour the code.
                The system desaturates full-colour images in those modes by default and can
                apply the person's chosen tint on top - and a QR that has lost its contrast
                will not scan, which is the entire job of this widget. */}
            {/* resizable() before the frame, or SwiftUI draws the image at its natural size
                and the frame merely crops it - which is why a 480px code appeared as a
                zoomed-in fragment of itself, unscannable. aspectRatio keeps it square so the
                modules stay readable. */}
            <Image
              uiImage={qrImageUri}
              modifiers={[
                resizable(),
                aspectRatio({ ratio: 1, contentMode: 'fit' }),
                frame({ width: 100, height: 100 }),
                widgetAccentedRenderingMode('fullColor'),
              ]}
            />
            {props.logoImageUri ? (
              <Image
                uiImage={props.logoImageUri}
                modifiers={[
                  resizable(),
                  aspectRatio({ ratio: 1, contentMode: 'fit' }),
                  frame({ width: 26, height: 26 }),
                  cornerRadius(5),
                  widgetAccentedRenderingMode('fullColor'),
                ]}
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
