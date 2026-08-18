import LottieView from 'lottie-react-native';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { useDeferredMount } from '@/lib/use-deferred-mount';

type ConnectionDeleteSheetProps = {
  visible: boolean;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
};

export function ConnectionDeleteSheet({
  visible,
  name,
  onCancel,
  onConfirm,
  loading,
}: ConnectionDeleteSheetProps) {
  const showLottie = useDeferredMount(visible);
  return (
    <BottomSheet
      visible={visible}
      title="Are you sure you want to delete?"
      onClose={onCancel}
      footer={
        <>
          <Button onPress={onConfirm} loading={loading}>Yes, delete</Button>
          <Button variant="secondary" onPress={onCancel} disabled={loading}>Keep</Button>
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
        Remove {name || 'this connection'} from your connections? Their card stays live online. You just won’t see them in your list or shared directory anymore.
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
