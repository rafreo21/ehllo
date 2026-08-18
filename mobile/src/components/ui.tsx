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
import { ArrowLeft, Check } from 'phosphor-react-native';

import { useAppInsets, useTabBarHeight } from '@/lib/safe-area';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
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
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
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

/**
 * The selectable pill used for a small set of mutually exclusive choices -
 * the Owner selector in Add follow-up, and the Events filter. Same shape and
 * states in both so a pill always means "pick one of these".
 */
export function ChoicePill({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choicePill,
        selected && styles.choicePillSelected,
        pressed && styles.choicePillPressed,
      ]}>
      <Text style={[styles.choicePillText, selected && styles.choicePillTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * An opt-in row: label, one line of consequence, and a state you can see.
 *
 * A switch would say less. The hint carries what actually happens, and the
 * disabled form carries why it cannot, because an option that is simply absent
 * leaves the user guessing whether the feature exists at all.
 */
export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
  icon }: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.toggleRow,
        value && !disabled && styles.toggleRowOn,
        disabled && styles.toggleRowDisabled,
        pressed && !disabled && styles.toggleRowPressed,
      ]}>
      {icon ? <View style={styles.toggleRowIcon}>{icon}</View> : null}
      <View style={styles.toggleRowCopy}>
        <Text style={[styles.toggleRowLabel, disabled && styles.toggleRowLabelDisabled]}>{label}</Text>
        {hint ? <Text style={styles.toggleRowHint}>{hint}</Text> : null}
      </View>
      <View style={[styles.toggleRowMark, value && !disabled && styles.toggleRowMarkOn]}>
        {value && !disabled ? <Check size={14} color={colors.ink} weight="bold" /> : null}
      </View>
    </Pressable>
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
  caption,
  onBack,
  rightAction,
  showBack = true,
}: {
  eyebrow?: string;
  title: string;
  titleStyle?: StyleProp<TextStyle>;
  description?: ReactNode;
  caption?: ReactNode;
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
        {caption ? <Text style={styles.pageHeaderCaption}>{caption}</Text> : null}
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
          <ActivityIndicator color={variant === 'primary' ? colors.white : colors.muted} />
        ) : null}
        {items.map((child, index) =>
          typeof child === 'string' || typeof child === 'number'
            ? (
              <Text
                key={`label-${index}`}
                style={[styles.buttonText, variant === 'primary' ? styles.buttonTextPrimary : styles.buttonTextSecondary]}>
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
  textStyle?: StyleProp<TextStyle>;
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
  textStyle,
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
          <Text style={[styles.pillText, solid ? styles.pillTextSolid : styles.pillTextOutline, textStyle]}>{children}</Text>
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
  choicePill: {
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x2,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  // Light fill rather than the dark one. A pill row is a view switch, not the
  // primary action on the screen, and inking the selected one made the filter
  // read heavier than the events beneath it. The accent already carries
  // selection elsewhere (the active tab, the check badge), and ink-on-accent
  // keeps the contrast well clear.
  choicePillSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  choicePillPressed: { opacity: 0.7 },
  choicePillText: { color: colors.ink, fontSize: 13, fontFamily: fonts.medium, fontWeight: '700' },
  choicePillTextSelected: { color: colors.ink },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface },
  toggleRowOn: { borderColor: colors.accentPressed, backgroundColor: colors.surface },
  toggleRowDisabled: { backgroundColor: colors.canvas, borderColor: colors.line },
  toggleRowPressed: { opacity: 0.8 },
  toggleRowIcon: { width: 32, height: 32, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  toggleRowCopy: { flex: 1, gap: 2 },
  toggleRowLabel: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  toggleRowLabelDisabled: { color: colors.muted },
  toggleRowHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  toggleRowMark: {
    width: 24,
    height: 24,
    borderRadius: radius.round,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface },
  toggleRowMarkOn: { backgroundColor: colors.accent, borderColor: colors.accentPressed },
  eyebrow: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, fontWeight: '700', letterSpacing: 0 },
  title: { color: colors.ink, fontSize: 40, lineHeight: 42, fontFamily: fonts.medium, fontWeight: '700', letterSpacing: -1.5 },
  body: { color: colors.muted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  pageHeaderCaption: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 15 },
  panel: { padding: spacing.x5, borderRadius: radius.medium, backgroundColor: colors.surface },
  button: { minHeight: 48, paddingHorizontal: spacing.x5, alignItems: 'center', justifyContent: 'center', borderRadius: radius.round, backgroundColor: colors.ink },
  buttonSecondary: { backgroundColor: colors.surfaceMuted },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  buttonTextPrimary: { color: colors.white },
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
  pillText: { fontSize: 12, fontFamily: fonts.bold, fontWeight: '800' },
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
  pageHeaderTitle: { fontFamily: fonts.regular, fontSize: 32, lineHeight: 34, letterSpacing: -1.1 },
});
