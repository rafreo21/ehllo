import { CheckCircle } from 'phosphor-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button, PillButton } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';

type ConnectionSuccessSheetProps = {
  visible: boolean;
  personName: string;
  mutual: boolean;
  onClose: () => void;
  onAddFollowUp: () => void;
  onViewCard: () => void;
};

export function ConnectionSuccessSheet({
  visible,
  personName,
  mutual,
  onClose,
  onAddFollowUp,
  onViewCard,
}: ConnectionSuccessSheetProps) {
  const name = personName.trim() || 'them';

  return (
    <BottomSheet
      visible={visible}
      title="Connected"
      onClose={onClose}
      footer={(
        <>
          <Button onPress={onAddFollowUp}>Add follow-up</Button>
          <PillButton tone="outline" onPress={onViewCard} style={styles.viewCardButton}>
            View card
          </PillButton>
        </>
      )}>
      <View style={styles.body}>
        <View style={styles.icon}>
          <CheckCircle size={28} color={colors.white} weight="fill" />
        </View>
        <Text style={styles.title}>You&apos;re connected with {name}</Text>
        <Body style={styles.copy}>
          {mutual
            ? `${name} has been added to your list, and you've been added to theirs — they've been notified too.`
            : `${name} has been added to your list.`}
        </Body>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: spacing.x3, paddingVertical: spacing.x2 },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  title: { color: colors.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  copy: { textAlign: 'center' },
  viewCardButton: { alignSelf: 'center' },
});
