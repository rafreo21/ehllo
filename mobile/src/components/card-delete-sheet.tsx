import LottieView from 'lottie-react-native';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { useDeferredMount } from '@/lib/use-deferred-mount';

type CardDeleteSheetProps = {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
};

export function CardDeleteSheet({
  visible,
  title,
  onCancel,
  onConfirm,
  loading,
}: CardDeleteSheetProps) {
  const showLottie = useDeferredMount(visible);
  return (
    <BottomSheet
      visible={visible}
      title="Are you sure you want to delete?"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onPress={onCancel} disabled={loading}>Keep card</Button>
          <Button onPress={onConfirm} loading={loading}>Yes, delete card</Button>
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
        {title ? `Delete "${title}"?` : 'Delete this card?'} It will be removed from your library and taken offline. This cannot be undone.
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
