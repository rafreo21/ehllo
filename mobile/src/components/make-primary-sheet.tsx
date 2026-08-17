import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { colors, spacing, fonts } from '@/theme/tokens';
import { StyleSheet, Text, View } from 'react-native';

type MakePrimarySheetProps = {
  visible: boolean;
  nextLabel: string;
  currentLabel: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MakePrimarySheet({
  visible,
  nextLabel,
  currentLabel,
  loading,
  onCancel,
  onConfirm,
}: MakePrimarySheetProps) {
  return (
    <BottomSheet visible={visible} title="Make this your primary card?" onClose={onCancel}>
      <Body>
        This will replace <Text style={styles.emphasis}>{currentLabel}</Text> as your primary card.
        Your primary card is the one shown on the Share step on Home.
      </Body>
      <View style={styles.actions}>
        <Button variant="secondary" onPress={onCancel} disabled={loading}>
          Keep current primary
        </Button>
        <Button loading={loading} onPress={onConfirm}>
          Make {nextLabel} primary
        </Button>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  emphasis: { color: colors.ink, fontFamily: fonts.bold, fontWeight: '800' },
  actions: { gap: spacing.x2 },
});
