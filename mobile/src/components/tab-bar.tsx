import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { useAppInsets } from '@/lib/safe-area';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

const ITEM_SIZE = 52;
const BADGE_SIZE = 40;

type TabIcon = (props: { focused: boolean; color: string; size: number }) => ReactNode;

type TabBarProps = {
  state: { routes: { key: string; name: string }[]; index: number };
  descriptors: Record<string, {
    options: {
      title?: string;
      tabBarIcon?: TabIcon;
      tabBarItemStyle?: unknown;
      tabBarAccessibilityLabel?: string;
    };
  }>;
  navigation: {
    navigate: (name: string) => void;
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
  };
};

export function AppTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useAppInsets();
  const visibleRoutes = state.routes.filter((route) => {
    const style = descriptors[route.key]?.options.tabBarItemStyle as { display?: string } | undefined | null;
    return style?.display !== 'none';
  });

  return (
    <View style={styles.wrap}>
      <Animated.View
        layout={LinearTransition.duration(220)}
        style={[styles.bar, { marginBottom: Math.max(insets.bottom, spacing.x3) + spacing.x1 }]}>
        {visibleRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const routeIndex = state.routes.findIndex((item) => item.key === route.key);
          const isFocused = state.index === routeIndex;
          const label = options.title ?? route.name;

          function onPress(_event: GestureResponderEvent) {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          }

          return (
            <Animated.View
              key={route.key}
              layout={LinearTransition.duration(220)}
              style={[styles.item, !isFocused && styles.itemInactive]}>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                onPress={onPress}
                style={styles.itemPressable}>
                <View style={[styles.badge, isFocused && styles.badgeActive]}>
                  {options.tabBarIcon?.({
                    focused: isFocused,
                    color: isFocused ? colors.ink : colors.line,
                    size: 21,
                  })}
                </View>
                {isFocused ? (
                  <Animated.Text
                    entering={FadeIn.duration(160).delay(60)}
                    exiting={FadeOut.duration(120)}
                    numberOfLines={1}
                    style={styles.label}>
                    {label}
                  </Animated.Text>
                ) : null}
              </Pressable>
            </Animated.View>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.x2,
    padding: 6,
    gap: 6,
    borderRadius: radius.round,
    backgroundColor: colors.ink,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  // The active item hugs its own content (badge + label) instead of
  // flex-growing to fill the row - flex:1 here left a dead gap between the
  // label and the pill's edge. Inactive items stay fixed circles.
  item: {
    height: ITEM_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.round,
    backgroundColor: colors.inkSoft,
    overflow: 'hidden',
  },
  itemInactive: { width: ITEM_SIZE },
  itemPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.x3,
    gap: spacing.x3,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.round,
    // Android doesn't reliably clip a View's own backgroundColor fill to
    // its borderRadius without an explicit overflow:hidden (iOS does, via
    // CALayer) - without this the badge rendered as a square there.
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeActive: { backgroundColor: colors.accent },
  label: { color: colors.white, fontSize: 14, fontFamily: fonts.bold, fontWeight: '800', flexShrink: 1 },
});
