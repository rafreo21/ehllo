import { StyleSheet, Text, View } from 'react-native';
import LottieView, { type AnimationObject } from 'lottie-react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { colors } from '@/theme/tokens';

type OutcomeErrorSheetProps = {
  visible: boolean;
  message: string;
  hint?: string;
  title?: string;
  onClose: () => void;
  lottieSource?: AnimationObject;
};

export function OutcomeErrorSheet({
  visible,
  message,
  hint,
  title = 'Something went wrong',
  onClose,
  lottieSource,
}: OutcomeErrorSheetProps) {
  const trimmed = message.trim();

  return (
    <BottomSheet
      visible={visible && Boolean(trimmed)}
      title={title}
      onClose={onClose}
      footer={<Button onPress={onClose}>OK</Button>}>
      <View style={styles.iconWrap}>
        <LottieView
          source={lottieSource || require('@/assets/animations/error.json')}
          autoPlay
          loop={false}
          style={styles.lottie}
        />
      </View>
      <Body style={styles.message}>{trimmed || 'Something went wrong.'}</Body>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignSelf: 'center',
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottie: { width: '100%', height: '100%' },
  message: { textAlign: 'center' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
