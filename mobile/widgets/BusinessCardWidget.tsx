import { Button, HStack, Image, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  padding,
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
};

function BusinessCardWidget(props: BusinessCardWidgetProps) {
  'widget';

  // The 'widget' directive serializes only this function's own body text
  // for native evaluation — nothing from outer scope is captured, not even
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
    company: 'Ehllo',
    cardUrl: 'https://aftermeet.app/c/demo',
    shareDeepLink: 'aftermeet://share-card',
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
  const deepLink = card.shareDeepLink || props.shareDeepLink || 'aftermeet://share-card';
  const qrImageUri = card.qrImageUri || props.qrImageUri;
  const photoImageUri = card.photoImageUri || props.photoImageUri;
  const initials = card.initials || props.initials || 'AM';

  return (
    <HStack
      modifiers={[
        containerBackground(WIDGET_COLORS.canvas, 'widget'),
        padding({ all: 10 }),
        widgetURL(deepLink),
      ]}>
      <VStack
        modifiers={[
          frame({ width: 72, height: 72 }),
          cornerRadius(12),
          padding({ all: 4 }),
        ]}>
        {qrImageUri ? (
          <ZStack modifiers={[frame({ width: 64, height: 64 })]}>
            <Image uiImage={qrImageUri} modifiers={[frame({ width: 64, height: 64 })]} />
            {props.logoImageUri ? (
              <Image uiImage={props.logoImageUri} modifiers={[frame({ width: 16, height: 16 }), cornerRadius(4)]} />
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
            modifiers={[frame({ width: 26, height: 26 }), cornerRadius(13)]}
          />
        ) : (
          <Text
            modifiers={[
              foregroundStyle(WIDGET_COLORS.accent),
              font({ weight: 'bold', size: 10 }),
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
          ]}>
          {card.name || props.name || 'My card'}
        </Text>
        {(card.role || props.role) ? (
          <Text modifiers={[foregroundStyle(WIDGET_COLORS.muted), font({ size: 10 })]}>
            {card.role || props.role}
          </Text>
        ) : null}
        {(card.company || props.company) ? (
          <Text modifiers={[foregroundStyle(WIDGET_COLORS.subtle), font({ size: 9 })]}>
            {card.company || props.company}
          </Text>
        ) : null}
        <HStack modifiers={[padding({ top: 4 })]}>
          <Text modifiers={[foregroundStyle(WIDGET_COLORS.accent), font({ size: 8, weight: 'bold' })]}>
            AFTERMEET
          </Text>
          {cards.length > 1 ? (
            <HStack modifiers={[padding({ leading: 8 })]}>
              <Text modifiers={[foregroundStyle(WIDGET_COLORS.subtle), font({ size: 8, weight: 'bold' })]}>
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
