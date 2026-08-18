import { StyleSheet, Text, View } from 'react-native';
import LottieView from 'lottie-react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { useDeferredMount } from '@/lib/use-deferred-mount';
import { colors, spacing, fonts } from '@/theme/tokens';

type ConnectionSuccessSheetProps = {
  visible: boolean;
  personName: string;
  mutual: boolean;
  onClose: () => void;
  onAddFollowUp: () => void;
  onStartCapture: () => void;
  onViewCard: () => void;
};

export function ConnectionSuccessSheet({
  visible,
  personName,
  mutual,
  onClose,
  onAddFollowUp,
  onStartCapture,
  onViewCard,
}: ConnectionSuccessSheetProps) {
  const name = personName.trim() || 'them';
  const showLottie = useDeferredMount(visible);

  return (
    <BottomSheet
      visible={visible}
      title="Connected"
      onClose={onClose}>
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

      <Button onPress={onAddFollowUp}>Add follow-up</Button>
      <Button variant="secondary" onPress={onStartCapture}>Start a capture</Button>
      <Button variant="secondary" onPress={onViewCard}>View card</Button>
      <Button variant="ghost" onPress={onClose}>Not now</Button>

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
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold, fontWeight: '800', textAlign: 'center' },
  copy: { textAlign: 'center' },
});
