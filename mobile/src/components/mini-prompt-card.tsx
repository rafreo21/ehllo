import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CaretRight } from 'phosphor-react-native';

import { colors, radius, spacing } from '@/theme/tokens';

type MiniPromptCardProps = {
  icon: ReactNode;
  title: string;
  copy?: string;
  onPress?: () => void;
};

export function MiniPromptCard({
  icon,
  title,
  copy,
  onPress,
}: MiniPromptCardProps) {
  const content = (
    <>
      <View style={styles.iconWrap}>{icon}</View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {copy ? <Text style={styles.body}>{copy}</Text> : null}
      </View>
      {onPress ? <CaretRight size={14} color={colors.muted} weight="bold" /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.card}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    paddingHorizontal: spacing.x4,
    paddingVertical: spacing.x3,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.88 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  copy: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});
