import { StyleSheet, View } from 'react-native';
import LottieView, { type AnimationObject } from 'lottie-react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { useDeferredMount } from '@/lib/use-deferred-mount';
import { spacing } from '@/theme/tokens';

type OutcomeSuccessSheetProps = {
  visible: boolean;
  message: string;
  title?: string;
  onClose: () => void;
  lottieSource?: AnimationObject;
};

export function OutcomeSuccessSheet({
  visible,
  message,
  title = 'Done',
  onClose,
  lottieSource,
}: OutcomeSuccessSheetProps) {
  const trimmed = message.trim();
  const showLottie = useDeferredMount(visible);

  return (
    <BottomSheet
      visible={visible && Boolean(trimmed)}
      title={title}
      onClose={onClose}
      footer={<Button onPress={onClose}>OK</Button>}>
      <View style={styles.group}>
        <View style={styles.videoWrap}>
          {showLottie ? (
            <LottieView
              source={lottieSource || require('@/assets/animations/success.json')}
              autoPlay
              loop={false}
              style={styles.video}
            />
          ) : null}
        </View>
        <Body style={styles.message}>{trimmed || 'All set.'}</Body>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // Tighter than the body's default inter-child gap (spacing.x4) — the
  // video's own frame already reads as a distinct block, so the message
  // doesn't need as much air under it as two separate sheet sections would.
  group: {
    gap: spacing.x2,
  },
  videoWrap: {
    alignSelf: 'center',
    width: 200,
    height: 200,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  message: { textAlign: 'center' },
});
