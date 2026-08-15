import { StyleSheet, Text, View } from 'react-native';
import LottieView from 'lottie-react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { useDeferredMount } from '@/lib/use-deferred-mount';
import { colors, radius, spacing } from '@/theme/tokens';

type CardPublishSheetProps = {
  visible: boolean;
  variant: 'success' | 'error';
  title: string;
  message: string;
  detail?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  onClose: () => void;
  loading?: boolean;
};

export function CardPublishSheet({
  visible,
  variant,
  title,
  message,
  detail,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  onClose,
  loading,
}: CardPublishSheetProps) {
  const isSuccess = variant === 'success';
  const showLottie = useDeferredMount(visible);

  return (
    <BottomSheet
      visible={visible}
      title={title}
      onClose={onClose}
      footer={
        <>
          {secondaryLabel && onSecondary ? (
            <Button variant="secondary" onPress={onSecondary} disabled={loading}>
              {secondaryLabel}
            </Button>
          ) : null}
          <Button onPress={onPrimary} loading={loading}>
            {primaryLabel || (isSuccess ? 'Done' : 'Try again')}
          </Button>
        </>
      }>
      <View style={styles.iconWrap}>
        {showLottie ? (
          <LottieView
            source={isSuccess
              ? require('@/assets/animations/card-published.json')
              : require('@/assets/animations/error.json')}
            autoPlay
            loop={false}
            style={styles.lottie}
          />
        ) : null}
      </View>
      <Body style={styles.message}>{message}</Body>
      {detail ? (
        <View style={styles.detailBox}>
          <Text style={styles.detailText}>{detail}</Text>
        </View>
      ) : null}
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
  detailBox: {
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
  },
  detailText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
