import { Children, Fragment, isValidElement, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  type GestureResponderEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';

import { useAppInsets, useTabBarHeight } from '@/lib/safe-area';
import { colors, radius, spacing } from '@/theme/tokens';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
  reserveTabBar?: boolean;
  /** Fixed content pinned below the scroll area, e.g. a primary action bar that shouldn't scroll away. */
  footer?: ReactNode;
  /** Fixed content pinned above the scroll area, e.g. a page header that shouldn't scroll away. */
  header?: ReactNode;
}>;

export function Screen({
  children,
  scroll = true,
  style,
  contentContainerStyle,
  edges = ['top'],
  reserveTabBar = true,
  footer,
  header,
}: ScreenProps) {
  const insets = useAppInsets();
  const tabBarHeight = useTabBarHeight();
  const paddingTop = edges.includes('top') && !header ? insets.top + spacing.x2 : 0;
  const paddingBottom = (edges.includes('bottom') && !footer ? insets.bottom : 0)
    + (reserveTabBar ? tabBarHeight : spacing.x3);

  const content = (
    <View
      style={[
        styles.screenContent,
        { paddingTop, paddingBottom: footer ? spacing.x4 : paddingBottom },
        style,
      ]}>
      {children}
    </View>
  );

  return (
    <View style={styles.safe}>
      {header ? (
        <View style={[styles.headerBar, { paddingTop: edges.includes('top') ? insets.top + spacing.x2 : 0 }]}>
          {header}
        </View>
      ) : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : content}
      {footer ? (
        <View style={[styles.footerBar, { paddingBottom: Math.max(insets.bottom, spacing.x3) }]}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function ScreenFrame({
  children,
  style,
  edges = ['top', 'bottom'],
  paddingHorizontal = spacing.x5,
}: PropsWithChildren<{
  style?: ViewStyle;
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
  paddingHorizontal?: number;
}>) {
  const insets = useAppInsets();

  return (
    <View
      style={[
        styles.safe,
        {
          paddingTop: edges.includes('top') ? insets.top + spacing.x2 : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom + spacing.x5 : spacing.x5,
          paddingHorizontal,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({ children, style }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Body({ children, style }: PropsWithChildren<{ style?: TextStyle }>) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Panel({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function BackButton({ onPress, style }: { onPress?: () => void; style?: ViewStyle }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={onPress ?? (() => router.back())}
      style={[styles.backButton, style]}>
      <ArrowLeft size={20} color={colors.ink} weight="bold" />
    </Pressable>
  );
}

/** Icon-only back button for step-flow footers, sized to sit beside a full-width primary Button. */
export function FooterBackButton({ onPress, style }: { onPress?: () => void; style?: ViewStyle }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={onPress ?? (() => router.back())}
      style={({ pressed }) => [styles.footerBackButton, pressed && styles.buttonPressed, style]}>
      <ArrowLeft size={20} color={colors.ink} weight="bold" />
    </Pressable>
  );
}

export function PageHeader({
  eyebrow,
  title,
  titleStyle,
  description,
  onBack,
  rightAction,
  showBack = true,
}: {
  eyebrow?: string;
  title: string;
  titleStyle?: StyleProp<TextStyle>;
  description?: ReactNode;
  onBack?: () => void;
  rightAction?: ReactNode;
  showBack?: boolean;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderTopRow}>
        {showBack ? <BackButton onPress={onBack} /> : <View style={styles.pageHeaderSpacer} />}
        {rightAction ? <View style={styles.pageHeaderAction}>{rightAction}</View> : null}
      </View>
      <View style={styles.pageHeaderCopy}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Text style={[styles.title, styles.pageHeaderTitle, titleStyle]}>{title}</Text>
        {description ? <Body>{description}</Body> : null}
      </View>
    </View>
  );
}

type ButtonProps = {
  children: ReactNode;
  onPress?: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function HeaderActionButton({
  accessibilityLabel,
  children,
  onPress,
  style,
}: PropsWithChildren<{
  accessibilityLabel: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerActionButton,
        style,
        pressed && styles.headerActionButtonPressed,
      ]}>
      {children}
    </Pressable>
  );
}

function flattenButtonChildren(children: ReactNode): ReactNode[] {
  const nodes: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (child == null || typeof child === 'boolean') return;
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      nodes.push(...flattenButtonChildren(child.props.children));
      return;
    }
    nodes.push(child);
  });
  return nodes;
}

export function Button({ children, onPress, variant = 'primary', disabled, loading, style }: ButtonProps) {
  const items = flattenButtonChildren(children);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        pressed && !loading && styles.buttonPressed,
        (disabled || loading) && styles.buttonDisabled,
        style,
      ]}>
      <View style={styles.buttonContent}>
        {loading ? (
          <ActivityIndicator color={variant === 'primary' ? colors.ink : colors.muted} />
        ) : null}
        {items.map((child, index) =>
          typeof child === 'string' || typeof child === 'number'
            ? (
              <Text
                key={`label-${index}`}
                style={[styles.buttonText, variant !== 'primary' && styles.buttonTextSecondary]}>
                {child}
              </Text>
            )
            : isValidElement(child) ? child : null
        )}
      </View>
    </Pressable>
  );
}

type PillButtonProps = {
  children: string;
  icon?: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  /** solid = event "Going" pill (ink fill, white label); outline = "Not going" pill (line outline, muted label). */
  tone?: 'solid' | 'outline';
  accessibilityLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Compact pill action used for event RSVP controls and, reusing the same
 * treatment/tokens, the Connected Accounts connect/disconnect actions. Single
 * source of truth so the two screens can never drift apart.
 */
export function PillButton({
  children,
  icon,
  onPress,
  tone = 'solid',
  accessibilityLabel,
  disabled,
  loading,
  style,
}: PillButtonProps) {
  const solid = tone === 'solid';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      // Keep the small visual size while lifting the touch target toward the
      // ~44pt iOS / 48dp Android minimum without changing layout.
      hitSlop={{ top: 8, bottom: 8 }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        solid ? styles.pillSolid : styles.pillOutline,
        pressed && !loading && styles.buttonPressed,
        (disabled || loading) && styles.buttonDisabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={solid ? colors.white : colors.muted} />
      ) : (
        <View style={styles.pillContent}>
          {icon}
          <Text style={[styles.pillText, solid ? styles.pillTextSolid : styles.pillTextOutline]}>{children}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingBottom: spacing.x2 },
  screenContent: { paddingHorizontal: spacing.x5, gap: spacing.x4 },
  headerBar: {
    gap: spacing.x4,
    paddingHorizontal: spacing.x5,
    paddingBottom: spacing.x4,
    backgroundColor: colors.canvas,
  },
  footerBar: {
    gap: spacing.x2,
    paddingHorizontal: spacing.x5,
    paddingTop: spacing.x3,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 40, lineHeight: 42, fontWeight: '700', letterSpacing: -1.5 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  panel: { padding: spacing.x5, borderRadius: radius.medium, backgroundColor: colors.surface },
  button: { minHeight: 48, paddingHorizontal: spacing.x5, alignItems: 'center', justifyContent: 'center', borderRadius: radius.small, backgroundColor: colors.accent },
  buttonSecondary: { backgroundColor: colors.surfaceMuted },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  buttonTextSecondary: { color: colors.ink },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x2,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillSolid: { backgroundColor: colors.ink },
  pillOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  pillContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.x2 },
  pillText: { fontSize: 12, fontWeight: '800' },
  pillTextSolid: { color: colors.white },
  pillTextOutline: { color: colors.muted },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.x2 },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
  },
  footerBackButton: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.small,
    backgroundColor: colors.surfaceMuted,
  },
  headerActionButton: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  headerActionButtonPressed: { backgroundColor: colors.surfaceMuted },
  pageHeader: {
    gap: spacing.x3,
  },
  pageHeaderTopRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageHeaderAction: { marginLeft: 'auto' },
  pageHeaderSpacer: { width: 42, height: 42 },
  pageHeaderCopy: { gap: spacing.x2 },
  pageHeaderTitle: { fontSize: 32, lineHeight: 34, letterSpacing: -1.1 },
});
