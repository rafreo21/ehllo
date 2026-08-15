import { router } from 'expo-router';
import { Clock } from 'phosphor-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

export function PendingSyncBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${count} item${count === 1 ? '' : 's'} waiting to sync`}
      onPress={() => router.push('/settings/pending-sync')}
      style={({ pressed }) => [styles.badge, pressed && styles.pressed]}>
      <Clock size={16} color={colors.ink} weight="bold" />
      <Text style={styles.text}>{count} waiting to sync</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x2,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceMuted,
  },
  pressed: { opacity: 0.75 },
  text: { color: colors.ink, fontSize: 12, fontWeight: '800' },
});
