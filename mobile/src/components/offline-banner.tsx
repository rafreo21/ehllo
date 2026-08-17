import LottieView from 'lottie-react-native';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useIsOnline } from '@/lib/connectivity';
import { useDeferredMount } from '@/lib/use-deferred-mount';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

export function OfflineBanner({
  message = "You're offline. Changes save on this device and sync automatically.",
  style,
}: {
  message?: string;
  style?: ViewStyle;
}) {
  const online = useIsOnline();
  const showLottie = useDeferredMount(!online);
  if (online) return null;

  return (
    <View style={[styles.banner, style]}>
      <View style={styles.iconWrap}>
        {showLottie ? (
          <LottieView
            source={require('@/assets/animations/offline-mode.json')}
            autoPlay
            loop={false}
            style={styles.lottie}
          />
        ) : null}
      </View>
      <Text style={styles.text}>{message}</Text>
    </View>
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
  iconWrap: { width: 44, height: 44, borderRadius: radius.round, overflow: 'hidden' },
  lottie: { width: '100%', height: '100%' },
  text: { flex: 1, color: colors.muted, fontSize: 12, fontFamily: fonts.bold, fontWeight: '700' },
});
