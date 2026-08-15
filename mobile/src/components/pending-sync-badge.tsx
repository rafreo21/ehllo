import LottieView from 'lottie-react-native';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useDeferredMount } from '@/lib/use-deferred-mount';
import { colors, radius, spacing } from '@/theme/tokens';

export function PendingSyncBadge({ count, style }: { count: number; style?: ViewStyle }) {
  const showLottie = useDeferredMount(count > 0);
  if (count <= 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${count} item${count === 1 ? '' : 's'} waiting to sync`}
      onPress={() => router.push('/settings/pending-sync')}
      style={({ pressed }) => [styles.banner, style, pressed && styles.pressed]}>
      <View style={styles.iconWrap}>
        {showLottie ? (
          <LottieView
            source={require('@/assets/animations/pending.json')}
            autoPlay
            loop={false}
            style={styles.lottie}
          />
        ) : null}
      </View>
      <Text style={styles.text}>{count} item{count === 1 ? '' : 's'} waiting to sync. Tap to review.</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x2,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
  },
  pressed: { opacity: 0.75 },
  iconWrap: { width: 44, height: 44, borderRadius: radius.round, overflow: 'hidden' },
  lottie: { width: '100%', height: '100%' },
  text: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: '700' },
});
