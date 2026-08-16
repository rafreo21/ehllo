import { Wallet } from 'phosphor-react-native';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

const ADD_LABEL = 'Add to Apple Wallet';
const VIEW_LABEL = 'View in Apple Wallet';
const OFFICIAL_BADGE = require('@/assets/images/add-to-apple-wallet-badge.png');

type AppleWalletButtonProps = {
  onPress?: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  mode?: 'add' | 'view';
  style?: StyleProp<ViewStyle>;
};

/**
 * Apple's official "Add to Apple Wallet" badge. Apple's guidelines call for
 * rendering it at its intrinsic aspect ratio; stretched to full width here
 * instead, per explicit product direction, so it matches the width of the
 * other action buttons on this screen. "View" mode has no equivalent
 * official artwork, so it falls back to a plain labeled pill sized to
 * match GoogleWalletButton's view mode.
 */
export function AppleWalletButton({ onPress, loading, disabled, mode = 'add', style }: AppleWalletButtonProps) {
  const unavailable = Boolean(disabled || loading);
  const viewing = mode === 'view';
  const label = viewing ? VIEW_LABEL : ADD_LABEL;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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
        {viewing ? (
          <View style={styles.content}>
            <Wallet size={21} color="#FFFFFF" weight="fill" />
            <Text style={styles.label}>{label}</Text>
          </View>
        ) : (
          <Image source={OFFICIAL_BADGE} resizeMode="stretch" style={styles.asset} accessibilityIgnoresInvertColors />
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
    width: '100%',
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 25,
  },
  asset: { width: '100%', height: '100%' },
  content: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000000',
  },
  label: { color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontWeight: '600' },
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
