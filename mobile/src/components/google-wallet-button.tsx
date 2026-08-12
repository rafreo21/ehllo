import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { GoogleWalletIcon } from '@/components/google-wallet-icon';
const WALLET_LABEL = 'Add to Google Wallet';
const OFFICIAL_BUTTON = require('@/assets/images/add-to-google-wallet-en-gb.png');
const VIEW_LABEL = 'View in Google Wallet';

type GoogleWalletButtonProps = {
  onPress?: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  mode?: 'add' | 'view';
  style?: StyleProp<ViewStyle>;
};

/**
 * Google's official localized English (Great Britain) Add to Google Wallet
 * primary button. The image is rendered at its intrinsic aspect ratio and is
 * not recolored, relabeled, cropped, or distorted.
 */
export function GoogleWalletButton({ onPress, loading, disabled, mode = 'add', style }: GoogleWalletButtonProps) {
  const unavailable = Boolean(disabled || loading);
  const viewing = mode === 'view';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={viewing ? VIEW_LABEL : WALLET_LABEL}
      accessibilityState={{ busy: Boolean(loading), disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.touchTarget,
        pressed && !unavailable && styles.pressed,
        unavailable && styles.disabledState,
        style,
      ]}>
      <View style={[styles.assetFrame, { width: viewing ? 287 : 283 }]}>
        {viewing ? (
          <View style={styles.viewContent}>
            <GoogleWalletIcon size={21} />
            <Text style={styles.viewLabel}>{VIEW_LABEL}</Text>
          </View>
        ) : (
          <Image source={OFFICIAL_BUTTON} resizeMode="contain" style={styles.asset} />
        )}
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
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetFrame: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 25,
    backgroundColor: '#1F1F1F',
  },
  asset: {
    width: '100%',
    height: '100%',
  },
  viewContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  viewLabel: { color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontWeight: '600' },
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
