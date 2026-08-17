import { StyleSheet, Text, View } from 'react-native';
import LottieView from 'lottie-react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button, PillButton } from '@/components/ui';
import { useDeferredMount } from '@/lib/use-deferred-mount';
import { colors, spacing, fonts } from '@/theme/tokens';

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
  const showLottie = useDeferredMount(visible);

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
          {showLottie ? (
            <LottieView
              source={require('@/assets/animations/connection-captured.json')}
              autoPlay
              loop={false}
              style={styles.lottie}
            />
          ) : null}
        </View>
        <Text style={styles.title}>You&apos;re connected with {name}</Text>
        <Body style={styles.copy}>
          {mutual
            ? `${name} has been added to your list, and you've been added to theirs. They've been notified too.`
            : `${name} has been added to your list.`}
        </Body>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: spacing.x2, paddingVertical: spacing.x2 },
  icon: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottie: { width: '100%', height: '100%' },
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.extrabold, fontWeight: '800', textAlign: 'center' },
  copy: { textAlign: 'center' },
  viewCardButton: { alignSelf: 'center' },
});
