import LottieView from 'lottie-react-native';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useDeferredMount } from '@/lib/use-deferred-mount';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

export function PendingSyncBadge({
  count,
  otherDevicesCount = 0,
  style,
}: {
  count: number;
  /** Items waiting to sync on other devices on this account, not this one — see useOtherDevicesPendingCount. */
  otherDevicesCount?: number;
  style?: ViewStyle;
}) {
  const total = count + otherDevicesCount;
  const showLottie = useDeferredMount(total > 0);
  if (total <= 0) return null;

  const label = count > 0
    ? `${count} item${count === 1 ? '' : 's'} waiting to sync${otherDevicesCount > 0 ? `, plus ${otherDevicesCount} on another device` : ''}. Tap to review.`
    : `${otherDevicesCount} item${otherDevicesCount === 1 ? '' : 's'} waiting to sync on another device.`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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
      <Text style={styles.text}>{label}</Text>
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
  text: { flex: 1, color: colors.muted, fontSize: 12, fontFamily: fonts.bold, fontWeight: '700' },
});
