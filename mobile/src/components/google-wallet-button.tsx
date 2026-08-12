import { ActivityIndicator, Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing } from '@/theme/tokens';

const WALLET_LABEL = 'Add to Google Wallet';
const OFFICIAL_BUTTON = require('@/assets/images/add-to-google-wallet-en-gb.png');
const OFFICIAL_ASPECT_RATIO = 283 / 50;

type GoogleWalletButtonProps = {
  onPress?: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Google's official localized English (Great Britain) Add to Google Wallet
 * primary button. The image is rendered at its intrinsic aspect ratio and is
 * not recolored, relabeled, cropped, or distorted.
 */
export function GoogleWalletButton({ onPress, loading, disabled, style }: GoogleWalletButtonProps) {
  const unavailable = Boolean(disabled || loading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={WALLET_LABEL}
      accessibilityState={{ busy: Boolean(loading), disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.touchTarget,
        pressed && !unavailable && styles.pressed,
        unavailable && styles.disabledState,
        style,
      ]}>
      <View style={styles.assetFrame}>
        <Image source={OFFICIAL_BUTTON} resizeMode="contain" style={styles.asset} />
        {loading ? (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    width: '100%',
    minHeight: 48 + spacing.x4,
    paddingVertical: spacing.x2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetFrame: {
    width: '100%',
    maxWidth: 360,
    minHeight: 48,
    aspectRatio: OFFICIAL_ASPECT_RATIO,
  },
  asset: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 25,
  },
  pressed: { opacity: 0.85 },
  disabledState: { opacity: 0.45 },
});
