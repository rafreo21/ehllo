import { HStack, Image, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  aspectRatio,
  background,
  containerBackground,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  resizable,
  widgetAccentedRenderingMode,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
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

export type BusinessCardWidgetProps = {
  cardsJson?: string;
  cardIndex?: number | string;
  logoImageUri?: string;
  shareDeepLink?: string;
  name?: string;
  role?: string;
  company?: string;
  initials?: string;
  qrImageUri?: string;
  photoImageUri?: string;
  /** '1' or '0'. Absent means the widget gallery, where sample content is correct. */
  signedIn?: string | boolean;
};

function BusinessCardWidget(props: BusinessCardWidgetProps) {
  'widget';

  // The 'widget' directive serializes only this function's own body text
  // for native evaluation - nothing from outer scope is captured, not even
  // plain constants. Every helper AND constant the render logic needs must
  // be declared inside this function.
  // From the layout guide: black canvas, three-step text ramp.
  const WIDGET_COLORS = {
    canvas: '#000000',
    accent: '#9FE870',
    text: '#FFFFFF',
    muted: '#BDBDBD',
    subtle: '#8F8F8F',
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

  function activeCardIndex(raw?: string | number) {
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.floor(value);
  }

  function activeCard(cards: WidgetCardRecord[], index: number) {
    if (!cards.length) return DEMO_CARD;
    return cards[index % cards.length] ?? cards[0] ?? DEMO_CARD;
  }

  // The layout guide has no pager row, so the previous card/next card controls are gone with
  // it - a widget can only show the first card now. Worth naming: the setup copy still tells
  // people they can switch cards from the widget.
  const cards = parseCardsJson(props.cardsJson);
  const index = activeCardIndex(props.cardIndex);
  const card = activeCard(cards, index);
  const deepLink = card.shareDeepLink || props.shareDeepLink || 'ehllo://share-card';
  const qrImageUri = card.qrImageUri || props.qrImageUri;
  const photoImageUri = card.photoImageUri || props.photoImageUri;
  const initials = card.initials || props.initials || 'AM';
  // Signed out, the card falls back to the demo person - so the home screen showed Alex
  // Morgan's name, role and company as though they were yours. Apple's guidance is explicit
  // that a widget needing an account should say so rather than inventing content.
  const signedOut = props.signedIn === '0' || props.signedIn === false;

  return (
    // 340x164 with a 308x117 inner row: horizontal, 16pt between the card and the text,
    // 16pt leading and 24pt top per the guide. No corner radius on the root - the system
    // applies the widget's own, which is what "use recommended" means.
    //
    // 24 + a 117pt card is 141pt, exactly the height of a medium widget on the smallest
    // iPhones, so this fits everywhere with nothing to spare: the card cannot grow past 117
    // without the top padding coming down with it.
    <HStack
      spacing={16}
      alignment="top"
      modifiers={[
        containerBackground(WIDGET_COLORS.canvas, 'widget'),
        padding({ leading: 16, top: 24, trailing: 16, bottom: 16 }),
        widgetURL(deepLink),
      ]}>
      {/* The white card's 7pt inset around a 103pt code is the only quiet zone these codes
          have - they are generated edge to edge with no margin of their own - so it is
          structural rather than decoration. */}
      <VStack
        modifiers={[
          frame({ width: 117, height: 117 }),
          background('#FFFFFF'),
          cornerRadius(7.2),
        ]}>
        {qrImageUri ? (
          <ZStack modifiers={[frame({ width: 103, height: 103 })]}>
            {/* resizable() before the frame, or SwiftUI draws the image at its natural size
                and the frame only crops it. fullColor so a tinted widget appearance cannot
                recolour the code out of scanning range. */}
            <Image
              uiImage={qrImageUri}
              modifiers={[
                resizable(),
                aspectRatio({ ratio: 1, contentMode: 'fit' }),
                frame({ width: 103, height: 103 }),
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
                  cornerRadius(6),
                  widgetAccentedRenderingMode('fullColor'),
                ]}
              />
            ) : null}
          </ZStack>
        ) : (
          <Text modifiers={[foregroundStyle('#8F8F8F'), font({ family: FONTS.regular, size: 11 })]}>QR</Text>
        )}
      </VStack>

      <VStack spacing={4} alignment="leading" modifiers={[frame({ width: 175 })]}>
        {photoImageUri ? (
          <Image
            uiImage={photoImageUri}
            modifiers={[
              resizable(),
              aspectRatio({ ratio: 1, contentMode: 'fill' }),
              frame({ width: 40, height: 40 }),
              // A 20pt radius on a 40pt square is the ellipse in the guide.
              cornerRadius(20),
            ]}
          />
        ) : (
          <Text
            modifiers={[
              foregroundStyle(WIDGET_COLORS.accent),
              font({ family: FONTS.regular, size: 14, weight: 'medium' }),
              frame({ width: 40, height: 40 }),
            ]}>
            {initials}
          </Text>
        )}

        <Text
          modifiers={[
            foregroundStyle(WIDGET_COLORS.text),
            font({ family: FONTS.regular, size: 16, weight: 'regular' }),
            lineLimit(1),
          ]}>
          {signedOut ? 'Sign in to ehllo' : (card.name || props.name || 'My card')}
        </Text>

        <VStack spacing={3} alignment="leading" modifiers={[frame({ width: 175 })]}>
          {signedOut ? (
            <Text modifiers={[foregroundStyle(WIDGET_COLORS.muted), font({ family: FONTS.regular, size: 12, weight: 'regular' }), lineLimit(1)]}>
              Your card appears here
            </Text>
          ) : (
            <>
              {(card.role || props.role) ? (
                <Text modifiers={[foregroundStyle(WIDGET_COLORS.muted), font({ family: FONTS.regular, size: 12, weight: 'regular' }), lineLimit(1)]}>
                  {card.role || props.role}
                </Text>
              ) : null}
              {(card.company || props.company) ? (
                // 10pt is below the 11pt Apple asks for as a legibility floor. Specified in
                // the guide, so it stands - noted here rather than silently corrected.
                <Text modifiers={[foregroundStyle(WIDGET_COLORS.subtle), font({ family: FONTS.regular, size: 10, weight: 'regular' }), lineLimit(1)]}>
                  {card.company || props.company}
                </Text>
              ) : null}
            </>
          )}
        </VStack>
      </VStack>
    </HStack>
  );
}

export default createWidget('BusinessCardWidget', BusinessCardWidget);
