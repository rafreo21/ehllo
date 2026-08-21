import { HStack, Link, Text, VStack } from '@expo/ui/swift-ui';
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

type WidgetConnectionRecord = {
  name: string;
  subtitle: string;
  phone?: string;
  email?: string;
};

export type RecentConnectionsWidgetProps = {
  connectionsDeepLink?: string;
  shareDeepLink?: string;
  connection1Name?: string;
  connection1Subtitle?: string;
  connection1Phone?: string;
  connection1Email?: string;
  connection2Name?: string;
  connection2Subtitle?: string;
  connection2Phone?: string;
  connection2Email?: string;
  connection3Name?: string;
  connection3Subtitle?: string;
  connection3Phone?: string;
  connection3Email?: string;
};

function RecentConnectionsWidget(props: RecentConnectionsWidgetProps) {
  'widget';

  // The 'widget' directive serializes only this function's own body text
  // for native evaluation - nothing from outer scope is captured, not even
  // plain constants. Every helper AND constant the render logic needs must
  // be declared inside this function.
  const WIDGET_COLORS = {
    canvas: '#141814',
    accent: '#9FE870',
    text: '#FFFFFF',
    subtle: '#8FA088',
  };

  // The app's own typeface, matching theme/tokens.ts. A widget extension is a separate
  // bundle, so plugins/withWidgetFonts.js copies these two weights into it and registers
  // them - without that, Font.custom falls back to the system face silently and the widget
  // would read in San Francisco while every other screen reads in Airbnb Cereal.
  const FONTS = { regular: 'AirbnbCereal_W_Bk', medium: 'AirbnbCereal_W_Md' };

  const DEMO_CONNECTIONS: WidgetConnectionRecord[] = [
    { name: 'Jordan Lee', subtitle: 'Shared via your card' },
    { name: 'Cameron Williamson', subtitle: 'Shared via your card' },
  ];

  function connectionSlots(props: Record<string, string | number | undefined>) {
    const rows = [1, 2, 3].map((slot) => {
      const name = String(props[`connection${slot}Name`] || '').trim();
      if (!name) return null;
      return {
        name,
        subtitle: String(props[`connection${slot}Subtitle`] || 'Shared via your card').trim(),
        phone: String(props[`connection${slot}Phone`] || '').trim(),
        email: String(props[`connection${slot}Email`] || '').trim(),
      };
    }).filter(Boolean) as WidgetConnectionRecord[];

    return rows.length ? rows : DEMO_CONNECTIONS;
  }

  function dialUrl(phone: string) {
    const digits = phone.replace(/[^\d+]/g, '');
    return digits ? `tel:${digits}` : '';
  }

  function messageUrl(email: string, phone: string) {
    if (phone.trim()) return `sms:${phone.replace(/\s+/g, '')}`;
    if (email.trim()) return `mailto:${email.trim()}`;
    return '';
  }

  const deepLink = props.connectionsDeepLink || props.shareDeepLink || 'ehllo://connections';
  const rows = connectionSlots(props);

  return (
    <VStack
      modifiers={[
        containerBackground(WIDGET_COLORS.canvas, 'widget'),
        // 11pt, Apple's sanctioned tighter margin for a content grouping - a list of rows.
        padding({ all: 11 }),
        widgetURL(deepLink),
      ]}>
      {/* Nothing under 11pt: Apple's guidance is that smaller text "can be too hard for many
          people to read". */}
      <Text modifiers={[foregroundStyle(WIDGET_COLORS.accent), font({ family: FONTS.medium, weight: 'bold', size: 11 })]}>
        RECENT CONNECTIONS
      </Text>
      {rows.map((row, rowIndex) => {
        const phoneUrl = dialUrl(row.phone || '');
        const messageHref = messageUrl(row.email || '', row.phone || '');

        return (
          <HStack key={`row-${rowIndex}`} modifiers={[padding({ top: 8 })]}>
            <Text
              modifiers={[
                foregroundStyle(WIDGET_COLORS.accent),
                font({ family: FONTS.medium, weight: 'bold', size: 11 }),
                frame({ width: 24, height: 24 }),
                cornerRadius(12),
              ]}>
              {row.name.slice(0, 1).toUpperCase()}
            </Text>
            <VStack modifiers={[padding({ leading: 4 })]}>
              <Text modifiers={[foregroundStyle(WIDGET_COLORS.text), font({ family: FONTS.medium, weight: 'bold', size: 12 })]}>
                {row.name}
              </Text>
              <Text modifiers={[foregroundStyle(WIDGET_COLORS.subtle), font({ family: FONTS.regular, size: 11 })]}>
                {row.subtitle}
              </Text>
            </VStack>
            {phoneUrl ? (
              <Link destination={phoneUrl}>
                <Text
                  modifiers={[
                    foregroundStyle(WIDGET_COLORS.text),
                    font({ family: FONTS.regular, size: 12 }),
                    frame({ width: 28, height: 28 }),
                    cornerRadius(14),
                  ]}>
                  ☎
                </Text>
              </Link>
            ) : null}
            {messageHref ? (
              <Link destination={messageHref}>
                <Text
                  modifiers={[
                    foregroundStyle(WIDGET_COLORS.text),
                    font({ family: FONTS.regular, size: 12 }),
                    frame({ width: 28, height: 28 }),
                    cornerRadius(14),
                  ]}>
                  ✉
                </Text>
              </Link>
            ) : null}
          </HStack>
        );
      })}
    </VStack>
  );
}

export default createWidget('RecentConnectionsWidget', RecentConnectionsWidget);
