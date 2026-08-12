import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { GoogleWalletIcon } from '@/components/google-wallet-icon';
import { radius, spacing } from '@/theme/tokens';

// The official button "only comes in black" per Google's brand guidelines.
const WALLET_BLACK = '#000000';
const WALLET_LABEL = 'Add to Google Wallet';

type GoogleWalletButtonProps = {
  onPress?: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * "Add to Google Wallet" button.
 *
 * Google brand guidelines
 * (developers.google.com/wallet/.../brand-guidelines) require the official
 * black button with the exact "Add to Google Wallet" label, a 48dp minimum
 * height, ≥8dp clear space on all sides, correct aspect ratio, and no
 * recoloring, relabeling, or distortion of the mark.
 *
 * INTERIM: this renders the compliant black treatment with the official
 * multicolor Wallet logo (undistorted) and the exact English label. For full
 * compliance — especially localized markets — replace this with Google's
 * downloadable, per-locale button asset and do not restyle it. The 8dp clear
 * space is provided by the parent action row's gap; keep it ≥8dp.
 */
export function GoogleWalletButton({ onPress, loading, disabled, style }: GoogleWalletButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={WALLET_LABEL}
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && !loading && styles.pressed,
        (disabled || loading) && styles.disabledState,
        style,
      ]}>
      <View style={styles.content}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <GoogleWalletIcon size={20} />}
        <Text style={styles.label}>{WALLET_LABEL}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.x5,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WALLET_BLACK,
  },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.x2 },
  label: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  disabledState: { opacity: 0.45 },
});
