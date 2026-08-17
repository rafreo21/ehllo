import { fonts } from '@/theme/tokens';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { GoogleWalletIcon } from '@/components/google-wallet-icon';
const ADD_LABEL = 'Add to Google Wallet';
const VIEW_LABEL = 'View in Google Wallet';

type GoogleWalletButtonProps = {
  onPress?: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  mode?: 'add' | 'view';
  style?: StyleProp<ViewStyle>;
};

/**
 * A custom black pill — Google's wallet icon plus real text, laid out with
 * flexbox — so it fills the same width as the Share button in both modes.
 * Matches AppleWalletButton's shape/sizing.
 */
export function GoogleWalletButton({ onPress, loading, disabled, mode = 'add', style }: GoogleWalletButtonProps) {
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
        <View style={styles.content}>
          <GoogleWalletIcon size={21} />
          <Text style={styles.label}>{label}</Text>
        </View>
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
  content: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000000',
  },
  label: { color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontFamily: fonts.semibold, fontWeight: '600' },
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
