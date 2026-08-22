import { Image, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import { background, containerBackground, cornerRadius, font, foregroundStyle, frame, padding, resizable, widgetAccentedRenderingMode, widgetURL } from '@expo/ui/swift-ui/modifiers';
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
  themeColor?: string;
};

export type QrScanWidgetProps = {
  shareDeepLink?: string;
  qrImageUri?: string;
  logoImageUri?: string;
  cardsJson?: string;
  /** '1' or '0'. Absent means the widget gallery, where sample content is the right answer. */
  signedIn?: string | boolean;
  themeColor?: string;
};

function QrScanWidget(props: QrScanWidgetProps) {
  'widget';

  // The 'widget' directive serializes only this function's own body text
  // for native evaluation - nothing from outer scope is captured, not even
  // plain constants. Every helper AND constant the render logic needs must
  // be declared inside this function.
  const WIDGET_COLORS = {
    // Black on every widget, on both platforms.
    canvas: '#000000',
    accent: '#9FE870',
    text: '#FFFFFF',
    muted: '#B8C4B3',
    subtle: '#8FA088',
  };

  // The app's own typeface, matching theme/tokens.ts. A widget extension is a separate
  // bundle, so plugins/withWidgetFonts.js copies these two weights into it and registers
  // them - without that, Font.custom falls back to the system face silently and the widget
  // would read in San Francisco while every other screen reads in Airbnb Cereal.
  const FONTS = { regular: 'AirbnbCereal_W_Bk', medium: 'AirbnbCereal_W_Md' };

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
        themeColor: card.themeColor,
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
  const canvasColor = card.themeColor || props.themeColor || WIDGET_COLORS.canvas;

  return (
    <VStack
      modifiers={[
        containerBackground(canvasColor, 'widget'),
        // containerBackground(_:for:) is iOS 17+ only and no-ops below that - see the same
        // comment in BusinessCardWidget.tsx. background() has no such gate and is the fallback
        // for the iOS 16 devices this app's deployment target (ios/Podfile) says it must serve.
        background(canvasColor),
        // A minimum guard only - the card below is a fixed size and the VStack centres it, so
        // the visible margin is (widget - card) / 2: about 14pt on this phone, which matches
        // the business card's 16pt closely, and 5pt on the smallest iPhone where there simply
        // is not more room. 5pt here rather than 16 is what keeps the code from clipping at
        // 141pt while staying as large as possible everywhere else.
        padding({ all: 5 }),
        widgetURL(deepLink),
      ]}>
        {qrImageUri ? (
          // A white card under the code, matching the QR screen in the app - and it earns its
          // place technically as well as visually: the padding around the code is the quiet
          // zone a scanner needs to find the symbol, which a code flush against a dark
          // background does not have.
          //
          // 130pt, up from 117. A flexible frame was tried here and is the wrong tool: rather
          // than expanding into the padded area it collapsed the card to 94pt, smaller than
          // what it replaced. So this is explicit again, sized against the smallest iPhone:
          // 130 + 2 x 5pt padding = 140, inside the 141pt a small widget has there.
          <ZStack
            modifiers={[
              frame({ width: 130, height: 130 }),
              background('#FFFFFF'),
              cornerRadius(7.2),
            ]}>
            {/* fullColor so a tinted or clear widget appearance cannot recolour the code.
                The system desaturates full-colour images in those modes by default and can
                apply the person's chosen tint on top - and a QR that has lost its contrast
                will not scan, which is the entire job of this widget. */}
            {/* IMAGES ONLY HONOUR resizable().
                @expo/ui applies image modifiers through applyImageModifier, which handles
                "resizable" and silently returns the image unchanged for everything else - the
                reduce has to keep the accumulator an Image, and frame/padding/background/
                cornerRadius all return some View. So a resizable image FILLS ITS CONTAINER and
                its own frame() is a no-op.
                That is why the logo, once given frame(22) + background(white) for its ring,
                expanded over the whole 130pt card and hid the code: the ring modifiers did
                nothing and nothing constrained it. All sizing therefore lives on containers. */}
            <ZStack modifiers={[frame({ width: 116, height: 116 })]}>
              <Image
                uiImage={qrImageUri}
                modifiers={[resizable(), widgetAccentedRenderingMode('fullColor')]}
              />
            </ZStack>
            {props.logoImageUri ? (
              // The ring is the container's white background; the inner box sizes the mark.
              <ZStack
                modifiers={[
                  frame({ width: 30, height: 30 }),
                  background('#FFFFFF'),
                  cornerRadius(7),
                ]}>
                <ZStack modifiers={[frame({ width: 22, height: 22 })]}>
                  <Image
                    uiImage={props.logoImageUri}
                    modifiers={[resizable(), widgetAccentedRenderingMode('fullColor')]}
                  />
                </ZStack>
              </ZStack>
            ) : null}
          </ZStack>
        ) : (
          // Said plainly instead of "Scan to connect", which promised a code that was not
          // there. Apple's guidance is explicit that a widget needing an account should say
          // so; the signed-out wording is theirs in spirit - "Sign in to view reservations".
          <Text modifiers={[foregroundStyle(WIDGET_COLORS.accent), font({ family: FONTS.medium, weight: 'bold', size: 13 })]}>
            {props.signedIn === '0' || props.signedIn === false
              ? 'Sign in to share your card'
              : 'Open ehllo to set up your card'}
          </Text>
        )}
    </VStack>
  );
}

export default createWidget('QrScanWidget', QrScanWidget);
