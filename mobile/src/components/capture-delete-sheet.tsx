import LottieView from 'lottie-react-native';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { useDeferredMount } from '@/lib/use-deferred-mount';

type CaptureDeleteSheetProps = {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
};

export function CaptureDeleteSheet({
  visible,
  title,
  onCancel,
  onConfirm,
  loading,
}: CaptureDeleteSheetProps) {
  const showLottie = useDeferredMount(visible);
  return (
    <BottomSheet
      visible={visible}
      title="Are you sure you want to delete?"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onPress={onCancel} disabled={loading}>Keep capture</Button>
          <Button onPress={onConfirm} loading={loading}>Yes, delete everything</Button>
        </>
      }>
      <View style={styles.iconWrap}>
        {showLottie ? (
          <LottieView
            source={require('@/assets/animations/warning.json')}
            autoPlay
            loop={false}
            style={styles.lottie}
          />
        ) : null}
      </View>
      <Body>
        {title ? `Delete "${title}"?` : 'Delete this capture?'} You will lose access to the summary, notes, transcript, and voice recording in the app. This cannot be undone.
      </Body>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignSelf: 'center',
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottie: { width: '100%', height: '100%' },
});
