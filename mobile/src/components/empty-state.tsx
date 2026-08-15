import type { AnimationObject } from 'lottie-react-native';
import LottieView from 'lottie-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';

type EmptyStateProps = {
  illustration: AnimationObject;
  title: string;
  copy?: string;
  onPress?: () => void;
  bordered?: boolean;
};

export function EmptyState({ illustration, title, copy, onPress, bordered }: EmptyStateProps) {
  const content = (
    <>
      <View style={styles.illustrationWrap}>
        <LottieView source={illustration} autoPlay loop={false} style={styles.illustration} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {copy ? <Body style={styles.copy}>{copy}</Body> : null}
    </>
  );

  const cardStyle = [styles.card, bordered && styles.cardBordered];

  if (!onPress) {
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
  title: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  copy: { lineHeight: 20 },
});
