import type { AnimationObject } from 'lottie-react-native';
import LottieView from 'lottie-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button } from '@/components/ui';
import { useDeferredMount } from '@/lib/use-deferred-mount';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

type EmptyStateProps = {
  illustration?: AnimationObject;
  title: string;
  copy?: string;
  onPress?: () => void;
  bordered?: boolean;
  /** Renders as an explicit button below the copy instead of making the whole card tappable — use for gates like "Sign in to see X" rather than plain "tap card to do X" empty states. */
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export function EmptyState({
  illustration,
  title,
  copy,
  onPress,
  bordered,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: EmptyStateProps) {
  const hasButtons = Boolean(primaryLabel && onPrimary);
  const showIllustration = useDeferredMount(Boolean(illustration));
  const content = (
    <>
      {illustration ? (
        <View style={styles.illustrationWrap}>
          {showIllustration ? (
            <LottieView source={illustration} autoPlay loop={false} style={styles.illustration} />
          ) : null}
        </View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {copy ? <Body style={styles.copy}>{copy}</Body> : null}
      {hasButtons ? (
        <View style={styles.buttonRow}>
          <Button onPress={onPrimary}>{primaryLabel}</Button>
          {secondaryLabel && onSecondary ? (
            <Button variant="secondary" onPress={onSecondary}>{secondaryLabel}</Button>
          ) : null}
        </View>
      ) : null}
    </>
  );

  const cardStyle = [styles.card, bordered && styles.cardBordered];

  if (hasButtons || !onPress) {
    return <View style={cardStyle}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [...cardStyle, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'flex-start',
    gap: spacing.x2,
    padding: spacing.x5,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
  },
  cardBordered: { borderWidth: 1, borderColor: colors.line },
  pressed: { opacity: 0.88 },
  illustrationWrap: { width: 96, height: 96 },
  illustration: { width: '100%', height: '100%' },
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold, fontWeight: '800' },
  copy: { lineHeight: 20 },
  buttonRow: { flexDirection: 'row', gap: spacing.x2, marginTop: spacing.x1, alignSelf: 'stretch' },
});
