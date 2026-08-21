import { Button, HStack, Image, Text, VStack, ZStack } from '@expo/ui/swift-ui';
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

  function activeCardIndex(raw?: string | number) {
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.floor(value);
  }

  function activeCard(cards: WidgetCardRecord[], index: number) {
    if (!cards.length) return DEMO_CARD;
    return cards[index % cards.length] ?? cards[0] ?? DEMO_CARD;
  }

  function cardPagerLabel(index: number, total: number) {
    return `CARD ${String((index % total) + 1).padStart(2, '0')}`;
  }

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
    <HStack
      modifiers={[
        containerBackground(WIDGET_COLORS.canvas, 'widget'),
        // 11pt: Apple's sanctioned tighter margin "to create content groupings", which is what
        // a code beside a name is. The standard 16 would squeeze the text column here.
        padding({ all: 11 }),
        widgetURL(deepLink),
      ]}>
      {/* The code was 64pt, using barely half the height available, for the one element
          anybody actually needs to reach.
          Sized from Apple's own table rather than the device in front of me: the smallest
          medium widget is 292x141pt on 320x568 screens, so 11pt margins leave 119pt of
          height - not the 133 a 375pt-wide phone suggests. Hence a 117pt card with a 105pt
          code, identical to the QR Scan widget because both are bounded by that same 119pt.
          143pt of width remains for the text column.
          The white card's inset is the only quiet zone these codes have; they are generated
          edge to edge with no margin of their own. */}
      <VStack
        modifiers={[
          frame({ width: 117, height: 117 }),
          background('#FFFFFF'),
          cornerRadius(20),
        ]}>
        {qrImageUri ? (
          <ZStack modifiers={[frame({ width: 105, height: 105 })]}>
            {/* Full colour for the same reason as the QR Scan widget: a tinted or clear
                appearance recolours full-colour images by default, and a recoloured QR does
                not scan. */}
            {/* resizable() before the frame. Without it SwiftUI draws the image at its
                natural size and the frame only crops, so a 480px code showed as a zoomed-in
                fragment of itself. */}
            <Image
              uiImage={qrImageUri}
              modifiers={[
                resizable(),
                aspectRatio({ ratio: 1, contentMode: 'fit' }),
                frame({ width: 105, height: 105 }),
                widgetAccentedRenderingMode('fullColor'),
              ]}
            />
            {props.logoImageUri ? (
              <Image
                uiImage={props.logoImageUri}
                modifiers={[
                  resizable(),
                  aspectRatio({ ratio: 1, contentMode: 'fit' }),
                  frame({ width: 27, height: 27 }),
                  cornerRadius(7),
                  widgetAccentedRenderingMode('fullColor'),
                ]}
              />
            ) : null}
          </ZStack>
        ) : (
          <Text modifiers={[foregroundStyle(WIDGET_COLORS.text), font({ weight: 'bold', size: 11 })]}>
            QR
          </Text>
        )}
      </VStack>

      <VStack modifiers={[padding({ leading: 10 })]}>
        {photoImageUri ? (
          <Image
            uiImage={photoImageUri}
            modifiers={[
              resizable(),
              aspectRatio({ ratio: 1, contentMode: 'fill' }),
              frame({ width: 26, height: 26 }),
              cornerRadius(13),
            ]}
          />
        ) : (
          <Text
            modifiers={[
              foregroundStyle(WIDGET_COLORS.accent),
              font({ weight: 'bold', size: 11 }),
              frame({ width: 26, height: 26 }),
            ]}>
            {initials}
          </Text>
        )}
        <Text
          modifiers={[
            foregroundStyle(WIDGET_COLORS.text),
            font({ weight: 'bold', size: 13 }),
            padding({ top: 4 }),
            lineLimit(1),
          ]}>
          {signedOut ? 'Sign in to ehllo' : (card.name || props.name || 'My card')}
        </Text>
        {signedOut ? (
          <Text modifiers={[foregroundStyle(WIDGET_COLORS.muted), font({ size: 11 }), lineLimit(1)]}>
            Your card appears here
          </Text>
        ) : (card.role || props.role) ? (
          // 11pt, not 10. Apple: text smaller than 11 points "can be too hard for many
          // people to read". Line-limited so the larger size cannot wrap the row.
          <Text modifiers={[foregroundStyle(WIDGET_COLORS.muted), font({ size: 11 }), lineLimit(1)]}>
            {card.role || props.role}
          </Text>
        ) : null}
        {(card.company || props.company) ? (
          <Text modifiers={[foregroundStyle(WIDGET_COLORS.subtle), font({ size: 11 }), lineLimit(1)]}>
            {card.company || props.company}
          </Text>
        ) : null}
        <HStack modifiers={[padding({ top: 4 })]}>
          <Text modifiers={[foregroundStyle(WIDGET_COLORS.accent), font({ size: 11, weight: 'bold' }), lineLimit(1)]}>
            ehllo
          </Text>
          {cards.length > 1 ? (
            <HStack modifiers={[padding({ leading: 8 })]}>
              <Text modifiers={[foregroundStyle(WIDGET_COLORS.subtle), font({ size: 11, weight: 'bold' }), lineLimit(1)]}>
                {cardPagerLabel(index, cards.length)}
              </Text>
              <Button
                target="card-prev"
                onPress={() => ({
                  cardIndex: (index - 1 + cards.length) % cards.length,
                })}>
                <Text modifiers={[foregroundStyle(WIDGET_COLORS.text), font({ size: 14, weight: 'bold' })]}>
                  ‹
                </Text>
              </Button>
              <Button
                target="card-next"
                onPress={() => ({
                  cardIndex: (index + 1) % cards.length,
                })}>
                <Text modifiers={[foregroundStyle(WIDGET_COLORS.text), font({ size: 14, weight: 'bold' })]}>
                  ›
                </Text>
              </Button>
            </HStack>
          ) : null}
        </HStack>
      </VStack>
    </HStack>
  );
}

export default createWidget('BusinessCardWidget', BusinessCardWidget);
