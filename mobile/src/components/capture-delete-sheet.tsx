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
  // Everything below defaults to the original "delete a saved capture"
  // wording so the existing call site is unaffected. The discard-draft
  // confirmation (capture/index.tsx) overrides these to reuse this same
  // sheet - same warning animation, same Keep/Confirm button pair - with
  // copy that fits discarding an in-progress, unsaved draft instead.
  heading?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  body?: string;
};

export function CaptureDeleteSheet({
  visible,
  title,
  onCancel,
  onConfirm,
  loading,
  heading = 'Are you sure you want to delete?',
  cancelLabel = 'Keep capture',
  confirmLabel = 'Yes, delete everything',
  body,
}: CaptureDeleteSheetProps) {
  const showLottie = useDeferredMount(visible);
  return (
    <BottomSheet
      visible={visible}
      title={heading}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onPress={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button onPress={onConfirm} loading={loading}>{confirmLabel}</Button>
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
        {body ?? `${title ? `Delete "${title}"?` : 'Delete this capture?'} You will lose access to the summary, notes, transcript, and voice recording in the app. This cannot be undone.`}
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
