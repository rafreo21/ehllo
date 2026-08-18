import LottieView from 'lottie-react-native';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { useDeferredMount } from '@/lib/use-deferred-mount';

/**
 * Stops sharing a card that does not exist publicly yet.
 *
 * Share and Card tools both assumed a published card. Tapping Share on a draft
 * opened the share screen as though a QR code existed, when a QR cannot be
 * generated until the card is published - so the user was handed a page that
 * could not work and no reason why.
 *
 * Saying so before the tap lands is the fix, along with a way straight to the
 * thing that unblocks it. The edit screen is the right destination for both
 * cases: it publishes when the card is complete, and shows what is missing when
 * it is not, so this never has to guess which of those applies.
 */
export function PublishFirstSheet({
  visible,
  cardId,
  action,
  onClose,
}: {
  visible: boolean;
  cardId: string | null;
  /** Which door they knocked on, so the copy names it. */
  action: 'share' | 'tools';
  onClose: () => void;
}) {
  const showIllustration = useDeferredMount(visible);

  return (
    <BottomSheet
      visible={visible}
      title="Publish this card first"
      onClose={onClose}
      footer={
        <>
          <Button
            onPress={() => {
              onClose();
              if (cardId) router.push(`/edit-card?id=${cardId}`);
            }}>
            Finish and publish
          </Button>
          <Button variant="ghost" onPress={onClose}>Not now</Button>
        </>
      }>
      <View style={styles.illustration}>
        {showIllustration ? (
          <LottieView
            source={require('@/assets/animations/card-published.json')}
            autoPlay
            loop={false}
            style={styles.lottie}
          />
        ) : null}
      </View>
      <Body style={styles.copy}>
        {action === 'share'
          ? 'Your card needs to be published before it can be shared. Publishing creates the link and QR code people scan.'
          : 'Card tools build on your published card, so there is nothing for them to work with yet.'}
      </Body>
      <Body style={styles.copy}>
        Publishing takes a moment, and you can keep editing afterwards.
      </Body>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  illustration: { alignSelf: 'center', width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  lottie: { width: '100%', height: '100%' },
  copy: { textAlign: 'center' },
});
