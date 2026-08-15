import LottieView from 'lottie-react-native';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { useDeferredMount } from '@/lib/use-deferred-mount';

type DisconnectAccountSheetProps = {
  visible: boolean;
  providerName: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
};

export function DisconnectAccountSheet({
  visible,
  providerName,
  onCancel,
  onConfirm,
  loading,
}: DisconnectAccountSheetProps) {
  const showLottie = useDeferredMount(visible);
  return (
    <BottomSheet
      visible={visible}
      title="Are you sure you want to disconnect?"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onPress={onCancel} disabled={loading}>Keep connected</Button>
          <Button onPress={onConfirm} loading={loading}>Yes, disconnect</Button>
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
        ehllo will lose access to {providerName} until you reconnect. Approved drafts already sent and existing ehllo data are not affected.
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
