import { CheckCircle } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { colors, radius } from '@/theme/tokens';

type OutcomeSuccessSheetProps = {
  visible: boolean;
  message: string;
  title?: string;
  onClose: () => void;
};

export function OutcomeSuccessSheet({
  visible,
  message,
  title = 'Done',
  onClose,
}: OutcomeSuccessSheetProps) {
  const trimmed = message.trim();

  return (
    <BottomSheet
      visible={visible && Boolean(trimmed)}
      title={title}
      onClose={onClose}
      footer={<Button onPress={onClose}>OK</Button>}>
      <View style={styles.iconWrap}>
        <CheckCircle size={34} color={colors.ink} weight="fill" />
      </View>
      <Body style={styles.message}>{trimmed || 'All set.'}</Body>
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
    backgroundColor: colors.accent,
  },
  message: { textAlign: 'center' },
});
