import { HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
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

type WidgetConnectionRecord = {
  name: string;
  subtitle: string;
  phone?: string;
  email?: string;
  initials?: string;
  photoUri?: string;
  profile?: string;
  mail?: string;
};

export type RecentConnectionsWidgetProps = {
  connectionsDeepLink?: string;
  shareDeepLink?: string;
  connection1Name?: string;
  connection1Subtitle?: string;
  connection1Phone?: string;
  connection1Email?: string;
  connection1Initials?: string;
  connection1PhotoUri?: string;
  connection1Profile?: string;
  connection1Mail?: string;
  connection2Name?: string;
  connection2Subtitle?: string;
  connection2Phone?: string;
  connection2Email?: string;
  connection2Initials?: string;
  connection2PhotoUri?: string;
  connection2Profile?: string;
  connection2Mail?: string;
  /** Supplied by the app so the scheme matches this build - see below. */
  scannerDeepLink?: string;
  /** '1' or '0'. Absent means the widget gallery, where sample content is the right answer. */
  signedIn?: string | boolean;
  themeColor?: string;
  themeTextColor?: string;
  themeMutedColor?: string;
};

function RecentConnectionsWidget(props: RecentConnectionsWidgetProps) {
  'widget';

  // The 'widget' directive serializes only this function's own body text
  // for native evaluation - nothing from outer scope is captured, not even
  // plain constants. Every helper AND constant the render logic needs must
  // be declared inside this function.
  const WIDGET_COLORS = {
    // Black, because "let #000000 be consistent" covers all three widgets. The layout guide
    // for this one says #2A2D2A; that would make it the only widget not black, so it is the
    // one number here taken from the earlier instruction instead of the guide.
    canvas: '#000000',
    accent: '#87EA5C',
    text: '#FFFFFF',
    subtle: '#BDBDBD',
    // Both the action circles and the add pill, per the guide.
    chip: '#4E4E4E',
    // The initials avatar when someone has no photo.
    avatarFallback: '#5DC154',
  };

  // The app's own typeface, matching theme/tokens.ts. A widget extension is a separate
  // bundle, so plugins/withWidgetFonts.js copies these two weights into it and registers
  // them - without that, Font.custom falls back to the system face silently and the widget
  // would read in San Francisco while every other screen reads in Airbnb Cereal.
  const FONTS = { regular: 'AirbnbCereal_W_Bk', medium: 'AirbnbCereal_W_Md' };

  // The guide is drawn at 157x72pt, which is about half the size of a real medium widget
  // (340x164 here, 292x141 on the smallest iPhones). Everything below is that guide scaled to
  // the real widget, with two corrections that cannot be scaled away: text sits at 11pt or
  // more, because Apple's guidance is that anything smaller "can be too hard for many people
  // to read" (the guide's 5.5pt and 7.4pt would be illegible), and the total height is held
  // under 141pt so nothing clips on the smallest iPhone. The proportions are the guide's.
  // Dialled back from avatar 36 / action 32 / name 16, which filled the widget so completely
  // that it read as zoomed in. Everything here is one step smaller with more space around it,
  // and text stays at or above Apple's 11pt floor.
  const SIZES = {
    avatar: 30,
    action: 26,
    rowGap: 12,
    infoGap: 10,
    textGap: 1,
    actionGap: 8,
  };
  const canvasColor = props.themeColor || WIDGET_COLORS.canvas;
  const textColor = props.themeTextColor || WIDGET_COLORS.text;
  const mutedColor = props.themeMutedColor || WIDGET_COLORS.subtle;
  // Use the foreground and canvas as an inverse pair for controls. On dark themes this
  // produces a bright button with a dark icon; on light themes it produces a dark button
  // with a light icon. That keeps small symbols legible instead of putting white on a fixed
  // charcoal chip that can disappear into some card colours.
  const actionBackgroundColor = textColor;
  const actionForegroundColor = canvasColor;


  function connectionSlots(props: Record<string, string | number | boolean | undefined>) {
    const rows = [1, 2].map((slot) => {
      const name = String(props[`connection${slot}Name`] || '').trim();
      if (!name) return null;
      return {
        name,
        subtitle: String(props[`connection${slot}Subtitle`] || 'Connected through ehllo').trim(),
        phone: String(props[`connection${slot}Phone`] || '').trim(),
        email: String(props[`connection${slot}Email`] || '').trim(),
        initials: String(props[`connection${slot}Initials`] || '').trim(),
        photoUri: String(props[`connection${slot}PhotoUri`] || '').trim(),
        profile: String(props[`connection${slot}Profile`] || '').trim(),
        mail: String(props[`connection${slot}Mail`] || '').trim(),
      };
    }).filter(Boolean) as WidgetConnectionRecord[];

    return rows;
  }

  function dialUrl(phone: string) {
    const digits = phone.replace(/[^\d+]/g, '');
    return digits ? `tel:${digits}` : '';
  }

  // Same shape check the app's own mailto builder uses (action-links.ts) - inlined rather
  // than imported, because the 'widget' directive above only serializes this function's own
  // body for native evaluation, nothing captured from outer scope. Without it, a malformed
  // address (bad sync data, a typo that slipped past card validation) produced a mailto: that
  // was guaranteed to fail silently instead of falling through to a channel that works.
  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function mailUrl(email: string, phone: string) {
    if (email.trim() && isValidEmail(email.trim())) return `mailto:${email.trim()}`;
    if (phone.trim()) return `sms:${phone.replace(/\s+/g, '')}`;
    return '';
  }

  function initialsFor(row: WidgetConnectionRecord) {
    if (row.initials) return row.initials.slice(0, 2).toUpperCase();
    return row.name.trim().slice(0, 1).toUpperCase() || '?';
  }

  // Every repeated element is built by a plain function call rather than by mapping inside the
  // JSX, and that is load-bearing rather than a style choice.
  //
  // expo-widgets' native evaluator reads a view's children with
  //   children.compactMap { $0 as? [String: Any] }
  // which keeps dictionaries and throws away anything else without a word. `{rows.map(...)}`
  // hands it a nested ARRAY in one child slot, so every row was discarded - the widget drew
  // its header, archived "success", and logged nothing at all. Calling the function inline
  // puts a dictionary in each slot instead, which is what survives that compactMap.
  function renderRow(row: WidgetConnectionRecord | undefined, rowIndex: number, placeholder?: boolean) {
    if (!row) return null;
    const phoneUrl = dialUrl(row.phone || '');
    // The prefilled follow-up the app built; a bare mailto is only the fallback.
    const mailHref = row.mail || mailUrl(row.email || '', row.phone || '');

    return (
      <HStack key={`row-${rowIndex}`} spacing={SIZES.infoGap} alignment="center">
        {row.photoUri ? (
          // resizable() before the frame, or SwiftUI draws the image at its natural size and
          // the frame merely crops it. fullColor so a tinted widget appearance cannot
          // desaturate someone's face.
          <Image
            uiImage={row.photoUri}
            modifiers={[
              resizable(),
              aspectRatio({ ratio: 1, contentMode: 'fill' }),
              frame({ width: SIZES.avatar, height: SIZES.avatar }),
              cornerRadius(SIZES.avatar / 2),
              widgetAccentedRenderingMode('fullColor'),
            ]}
          />
        ) : (
          // frame then background then cornerRadius: the background fills the frame, so this
          // is a real filled circle. It used to be frame + cornerRadius with no fill at all,
          // which draws nothing, so the initial floated with no shape behind it.
          <Text
            modifiers={[
              foregroundStyle(actionForegroundColor),
              font({ family: FONTS.regular, size: 12 }),
              frame({ width: SIZES.avatar, height: SIZES.avatar }),
              background(placeholder ? mutedColor : actionBackgroundColor),
              cornerRadius(SIZES.avatar / 2),
            ]}>
            {placeholder ? ' ' : initialsFor(row)}
          </Text>
        )}

        {/* The person's own tap target: opens THAT person, not the connections list. Only the
            empty area around the rows falls through to the widget's own widgetURL. lineLimit(1)
            on both lines so one long name cannot make its row taller than the other. */}
        <Link destination={row.profile || props.connectionsDeepLink || 'ehllo://connections'}>
          <VStack spacing={SIZES.textGap} alignment="leading">
            <Text
              modifiers={[
                foregroundStyle(placeholder ? mutedColor : textColor),
                font({ family: FONTS.regular, size: 14 }),
                lineLimit(1),
              ]}>
              {row.name}
            </Text>
            <Text
              modifiers={[
                foregroundStyle(mutedColor),
                font({ family: FONTS.regular, size: 11 }),
                lineLimit(1),
              ]}>
              {row.subtitle}
            </Text>
          </VStack>
        </Link>

        {/* A Spacer rather than a fixed text column. A medium widget is 292pt wide on the
            smallest iPhones and 360 on the largest, so any hardcoded width overflows at one
            end of that range. This pins the actions right at every width instead. */}
        <Spacer />

        {phoneUrl ? (
          <Link destination={phoneUrl}>
            <Image
              systemName="phone.fill"
              modifiers={[
                foregroundStyle(actionForegroundColor),
                font({ size: 11 }),
                frame({ width: SIZES.action, height: SIZES.action }),
                background(actionBackgroundColor),
                cornerRadius(SIZES.action / 2),
              ]}
            />
          </Link>
        ) : null}

        {mailHref ? (
          <Link destination={mailHref}>
            <Image
              systemName="envelope.fill"
              modifiers={[
                foregroundStyle(actionForegroundColor),
                font({ size: 11 }),
                frame({ width: SIZES.action, height: SIZES.action }),
                background(actionBackgroundColor),
                cornerRadius(SIZES.action / 2),
              ]}
            />
          </Link>
        ) : null}
      </HStack>
    );
  }

  // The pill takes the place of a second row when there is only one connection, so the widget
  // always has two lines of content instead of a row and a gap.
  function renderAddButton() {
    // The scheme differs per variant - staging registers ehllo-staging, production ehllo - so
    // a hardcoded "ehllo://scanner" opened nothing at all on a staging build. The app sends
    // the right one; the fallback only matters in the widget gallery.
    const scannerLink = props.scannerDeepLink?.trim() || 'ehllo://scanner';
    return (
      <Link destination={scannerLink}>
        <HStack
          spacing={6}
          alignment="center"
          modifiers={[
            padding({ leading: 12, trailing: 12, top: 6, bottom: 6 }),
            background(actionBackgroundColor),
            cornerRadius(13),
          ]}>
          <Image
            systemName="plus.circle.fill"
            modifiers={[foregroundStyle(actionForegroundColor), font({ size: 13 })]}
          />
          <Text
            modifiers={[
              foregroundStyle(actionForegroundColor),
              font({ family: FONTS.regular, size: 12 }),
              lineLimit(1),
            ]}>
            Add new connection
          </Text>
          {/* The Spacer is what makes the pill span the full width - a fixed width would be
              wrong on some device, since a medium widget is 292 to 360pt wide. */}
          <Spacer />
        </HStack>
      </Link>
    );
  }

  const deepLink = props.connectionsDeepLink || props.shareDeepLink || 'ehllo://connections';
  const rows = connectionSlots(props);
  // Three states, not two. Signed out says so. Signed in with nothing yet gets the add pill,
  // which is the actual next step rather than a sentence about one. The gallery - where
  // signedIn is absent entirely - keeps realistic sample rows.
  const signedOut = props.signedIn === '0' || props.signedIn === false;
  // Same reasoning as the business card: an absent snapshot is indistinguishable from a widget
  // placed before the app ever synced, so sample people must not stand in for real ones. A new
  // user used to see Jordan Lee and Christain Bale listed as their own connections.
  const visible = rows;
  // Nothing yet: a dummy row in the real row's shape, then the add pill. An empty widget with
  // only a header reads as broken rather than as new.
  const empty = !signedOut && visible.length === 0;
  const PLACEHOLDER_ROW: WidgetConnectionRecord = {
    name: 'Your connections',
    subtitle: 'Appear here after you share',
  };

  return (
    // Height budget for the smallest iPhone, where a medium widget is 141pt tall:
    // 12 top + 14 header + 10 + 34 + 10 + 34 = 114, leaving room to spare. A third row would
    // not fit, which is why the guide has two.
    <VStack
      spacing={SIZES.rowGap}
      alignment="leading"
      modifiers={[
        containerBackground(canvasColor, 'widget'),
        // containerBackground(_:for:) is iOS 17+ only and no-ops below that - see the same
        // comment in BusinessCardWidget.tsx. background() has no such gate and is the fallback
        // for the iOS 16 devices this app's deployment target (ios/Podfile) says it must serve.
        background(canvasColor),
        // 16pt, the same margin as the business card widget, so the two do not look like they
        // were laid out to different rules when they sit together on a home screen.
        padding({ leading: 16, trailing: 16, top: 16 }),
        widgetURL(deepLink),
      ]}>
      <Text
        modifiers={[
          foregroundStyle(textColor),
          font({ family: FONTS.medium, weight: 'bold', size: 11 }),
        ]}>
        Recent Connections
      </Text>

      {signedOut ? (
        <Text
          modifiers={[
            foregroundStyle(mutedColor),
            font({ family: FONTS.regular, size: 12 }),
            lineLimit(2),
          ]}>
          Sign in to see the people you meet
        </Text>
      ) : null}

      {/* One child slot each - see renderRow on why these are not a .map(). */}
      {signedOut ? null : empty ? renderRow(PLACEHOLDER_ROW, 0, true) : renderRow(visible[0], 0)}
      {signedOut || empty ? null : renderRow(visible[1], 1)}

      {/* Two rows fill the widget on their own; with one connection, or none, the pill takes
          the second slot. */}
      {signedOut || visible.length > 1 ? null : renderAddButton()}

      {/* A VStack centres its content vertically, so the rows floated in the middle of a 164pt
          widget. This pushes them to the top, where a list belongs. */}
      <Spacer />
    </VStack>
  );
}

export default createWidget('RecentConnectionsWidget', RecentConnectionsWidget);
