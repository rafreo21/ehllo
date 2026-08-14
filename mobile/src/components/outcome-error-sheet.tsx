import { WarningCircle } from 'phosphor-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { colors, radius } from '@/theme/tokens';

type OutcomeErrorSheetProps = {
  visible: boolean;
  message: string;
  hint?: string;
  title?: string;
  onClose: () => void;
};

export function OutcomeErrorSheet({
  visible,
  message,
  hint,
  title = 'Something went wrong',
  onClose,
}: OutcomeErrorSheetProps) {
  const trimmed = message.trim();

  return (
    <BottomSheet
      visible={visible && Boolean(trimmed)}
      title={title}
      onClose={onClose}
      footer={<Button onPress={onClose}>OK</Button>}>
      <View style={styles.iconWrap}>
        <WarningCircle size={34} color={colors.danger} weight="fill" />
      </View>
      <Body style={styles.message}>{trimmed || 'Something went wrong.'}</Body>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDECEA',
  },
  message: { textAlign: 'center' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
