import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { MAX_CARDS } from '@/features/card/card-library';
import { useCard } from '@/features/card/card-context';
import { describeError } from '@/lib/friendly-error';
import { spacing } from '@/theme/tokens';

type OnlyCardPrimarySheetProps = {
  visible: boolean;
  onClose: () => void;
  onError?: (message: string) => void;
};

export function OnlyCardPrimarySheet({ visible, onClose, onError }: OnlyCardPrimarySheetProps) {
  const { cards, canCreateCard, createCard } = useCard();
  const [creating, setCreating] = useState(false);

  async function handleCreateAnother() {
    if (!canCreateCard) {
      onError?.(`You can save a maximum of ${MAX_CARDS} cards.`);
      onClose();
      return;
    }

    setCreating(true);
    try {
      const created = await createCard({ label: `Card ${cards.length + 1}` });
      onClose();
      if (created) {
        router.push(`/edit-card?id=${created.id}`);
        return;
      }
      onError?.(`You can save a maximum of ${MAX_CARDS} cards.`);
    } catch (caught) {
      onError?.(describeError(caught, 'Could not create a card.'));
      onClose();
    } finally {
      setCreating(false);
    }
  }

  return (
    <BottomSheet visible={visible} title="Your only card" onClose={onClose}>
      <Body>
        This is the only card in your library, so it stays your primary card on Home.
        Create another card if you want to switch which one appears when you share.
      </Body>
      <View style={styles.actions}>
        <Button variant="secondary" onPress={onClose} disabled={creating}>
          Got it
        </Button>
        <Button loading={creating} onPress={() => void handleCreateAnother()}>
          Create another card
        </Button>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.x2 },
});
