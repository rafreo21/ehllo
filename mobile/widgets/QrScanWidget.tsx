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
            {/* resizable() before the frame, or SwiftUI draws the image at its natural size
                and the frame merely crops it - which is why a 480px code appeared as a
                zoomed-in fragment of itself, unscannable. aspectRatio keeps it square so the
                modules stay readable. */}
            {/* 116pt inside a 130pt card leaves the 7pt inset that is the quiet zone a scanner
                needs. Up from 105. */}
            <Image
              uiImage={qrImageUri}
              modifiers={[
                resizable(),
                aspectRatio({ ratio: 1, contentMode: 'fit' }),
                frame({ width: 116, height: 116 }),
                widgetAccentedRenderingMode('fullColor'),
              ]}
            />
            {props.logoImageUri ? (
              <Image
                uiImage={props.logoImageUri}
                modifiers={[
                  resizable(),
                  aspectRatio({ ratio: 1, contentMode: 'fit' }),
                  // A white ring so the mark reads as sitting ON the code rather than being
                  // part of it. The logo shrinks from 30 to 22 so the ring grows inward: the
                  // white footprint stays 30pt, which keeps the occluded share of the code
                  // unchanged and the code as scannable as it was.
                  frame({ width: 22, height: 22 }),
                  padding({ all: 4 }),
                  background('#FFFFFF'),
                  cornerRadius(7),
                  widgetAccentedRenderingMode('fullColor'),
                ]}
              />
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
