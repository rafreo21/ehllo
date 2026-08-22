import { HStack, Image, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
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
  themeColor?: string;
  themeTextColor?: string;
  themeMutedColor?: string;
  themeSoftColor?: string;
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
  themeColor?: string;
  themeTextColor?: string;
  themeMutedColor?: string;
  themeSoftColor?: string;
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
    // The demo card is for the gallery, where there is no cardsJson at all. A real but empty
    // '[]' means "no published primary card" and must NOT become the demo card, or the
    // placeholder state can never be reached.
    if (!raw?.trim()) return [DEMO_CARD];
    try {
      const parsed = JSON.parse(raw) as WidgetCardRecord[];
      if (!Array.isArray(parsed)) return [DEMO_CARD];
      if (parsed.length === 0) return [];
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
        themeTextColor: card.themeTextColor,
        themeMutedColor: card.themeMutedColor,
        themeSoftColor: card.themeSoftColor,
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
  // Only a published primary card renders. With none, the app now sends no cards at all, so
  // this is the placeholder state: dummy name, role and company against a blank white QR
  // panel, which reads as "set your card up" rather than as somebody else's finished card.
  const hasCard = Boolean(props.cardsJson?.trim()) && cards.length > 0 && cards[0] !== DEMO_CARD;
  // Any absence of a real card shows the placeholder - including when there is no snapshot at
  // all. This was gated on `props.signedIn !== undefined`, on the reasoning that an absent
  // snapshot means the widget gallery, where sample content is right. But a widget somebody
  // PLACED on a device that has not synced yet also has no snapshot, and there is no way to
  // tell the two apart from in here. So a brand-new user who added this widget before opening
  // the app saw Alex Morgan's name, role and company presented as their own - the exact fault
  // we have spent the day removing everywhere else. The gallery showing "Your name" is a small
  // cost; a stranger's details on a real home screen is not.
  const noPrimary = !hasCard;
  const deepLink = card.shareDeepLink || props.shareDeepLink || 'ehllo://share-card';
  const qrImageUri = card.qrImageUri || props.qrImageUri;
  const photoImageUri = card.photoImageUri || props.photoImageUri;
  const initials = card.initials || props.initials || 'AM';
  // Signed out, the card falls back to the demo person - so the home screen showed Alex
  // Morgan's name, role and company as though they were yours. Apple's guidance is explicit
  // that a widget needing an account should say so rather than inventing content.
  const signedOut = props.signedIn === '0' || props.signedIn === false;
  const canvasColor = card.themeColor || props.themeColor || WIDGET_COLORS.canvas;
  const textColor = card.themeTextColor || props.themeTextColor || WIDGET_COLORS.text;
  const mutedColor = card.themeMutedColor || props.themeMutedColor || WIDGET_COLORS.muted;
  const subtleColor = card.themeSoftColor || props.themeSoftColor || WIDGET_COLORS.subtle;

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
      alignment="center"
      modifiers={[
        containerBackground(canvasColor, 'widget'),
        // containerBackground(_:for:) is iOS 17+ only - @expo/ui's own modifier no-ops below
        // that (ContainerBackgroundModifier.swift falls through to `content` unchanged on
        // iOS < 17), so on iOS 16 nothing paints this canvas at all and WidgetKit falls back
        // to its own default light background - every widget shows correct text and images on
        // a plain white card, on real iOS 16 hardware, which is exactly the "white, not black"
        // report this app's own iOS 16.4 deployment target (ios/Podfile) says it must support.
        // Plain background() carries no such gate, so it is the fallback for iOS < 17;
        // redundant with containerBackground on 17+, which is harmless.
        background(canvasColor),
        // Horizontal padding only. A fixed 24pt top against a 16pt bottom pushed everything
        // low and left uneven margins, and any fixed pair is wrong on some device anyway:
        // a medium widget is 164pt tall here and 141pt on the smallest iPhones, so the spare
        // height differs by 23pt. With no vertical padding the 117pt row centres itself, which
        // makes the top and bottom margins equal everywhere by construction rather than by
        // arithmetic that only holds on one screen.
        padding({ leading: 16, trailing: 16 }),
        widgetURL(deepLink),
      ]}>
      {/* The white card's 7pt inset around a 103pt code is the only quiet zone these codes
          have - they are generated edge to edge with no margin of their own - so it is
          structural rather than decoration. */}
      {/* White ONLY when there is a code to sit on it.
          The placeholder used to paint this card white and leave it empty, which on a home
          screen is indistinguishable from a broken widget - a big white square. That is what a
          brand-new user saw before publishing a card, and what "the widgets are white" reports
          were describing. With nothing to show, this stays a dim panel on the dark canvas so it
          reads as "not set up yet" rather than "broken". */}
      <VStack
        modifiers={[
          frame({ width: 117, height: 117 }),
          background(qrImageUri ? '#FFFFFF' : '#1F221F'),
          cornerRadius(7.2),
        ]}>
        {qrImageUri ? (
          <ZStack modifiers={[frame({ width: 103, height: 103 })]}>
            {/* Images only honour resizable() - see QrScanWidget for the detail. Everything
                that positions or decorates has to sit on a container, or it is silently
                dropped and the image simply fills whatever contains it. */}
            <Image
              uiImage={qrImageUri}
              modifiers={[resizable(), widgetAccentedRenderingMode('fullColor')]}
            />
            {props.logoImageUri ? (
              <ZStack
                modifiers={[
                  frame({ width: 26, height: 26 }),
                  background('#FFFFFF'),
                  cornerRadius(6),
                ]}>
                <ZStack modifiers={[frame({ width: 20, height: 20 })]}>
                  <Image
                    uiImage={props.logoImageUri}
                    modifiers={[resizable(), widgetAccentedRenderingMode('fullColor')]}
                  />
                </ZStack>
              </ZStack>
            ) : null}
          </ZStack>
        ) : (
          <Text
            modifiers={[
              foregroundStyle(WIDGET_COLORS.subtle),
              font({ family: FONTS.regular, size: 11 }),
              lineLimit(2),
            ]}>
            Publish your card
          </Text>
        )}
      </VStack>

      <VStack spacing={4} alignment="leading" modifiers={[frame({ width: 175, alignment: 'leading' })]}>
        {photoImageUri ? (
          // Sized and rounded by its container, for the same reason as the code above.
          <ZStack modifiers={[frame({ width: 40, height: 40 }), cornerRadius(20)]}>
            <Image uiImage={photoImageUri} modifiers={[resizable()]} />
          </ZStack>
        ) : (
          <Text
            modifiers={[
              foregroundStyle(WIDGET_COLORS.accent),
              font({ family: FONTS.regular, size: 14, weight: 'medium' }),
              frame({ width: 40, height: 40 }),
              // Filled only in the placeholder state, where there are no initials to show and
              // an empty 40pt gap would just look like a layout fault.
              background(noPrimary || signedOut ? '#2A2D2A' : '#00000000'),
              cornerRadius(20),
            ]}>
            {noPrimary || signedOut ? ' ' : initials}
          </Text>
        )}

        <Text
          modifiers={[
              foregroundStyle(textColor),
            font({ family: FONTS.regular, size: 16, weight: 'regular' }),
            lineLimit(1),
          ]}>
          {signedOut ? 'Sign in to ehllo' : noPrimary ? 'Your name' : (card.name || props.name || 'My card')}
        </Text>

        <VStack spacing={3} alignment="leading" modifiers={[frame({ width: 175, alignment: 'leading' })]}>
          {signedOut ? (
            <Text modifiers={[foregroundStyle(mutedColor), font({ family: FONTS.regular, size: 12, weight: 'regular' }), lineLimit(1)]}>
              Your card appears here
            </Text>
          ) : noPrimary ? (
            // Placeholder rather than a real-looking person: there is no published primary
            // card, and inventing Alex Morgan here is what put a stranger's details on a real
            // home screen before.
            <>
              <Text modifiers={[foregroundStyle(mutedColor), font({ family: FONTS.regular, size: 12, weight: 'regular' }), lineLimit(1)]}>
                Your role
              </Text>
              <Text modifiers={[foregroundStyle(subtleColor), font({ family: FONTS.regular, size: 12, weight: 'regular' }), lineLimit(1)]}>
                Your company
              </Text>
            </>
          ) : (
            <>
              {(card.role || props.role) ? (
                <Text modifiers={[foregroundStyle(mutedColor), font({ family: FONTS.regular, size: 12, weight: 'regular' }), lineLimit(1)]}>
                  {card.role || props.role}
                </Text>
              ) : null}
              {(card.company || props.company) ? (
                // Same 12pt as the role above it, so the two lines read as one block rather
                // than a step down in scale. Only the colour separates them now, which also
                // puts it back above Apple's 11pt legibility floor.
                <Text modifiers={[foregroundStyle(subtleColor), font({ family: FONTS.regular, size: 12, weight: 'regular' }), lineLimit(1)]}>
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
