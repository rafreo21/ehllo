import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { PillButton } from '@/components/ui';
import type { FollowUpSort } from '@/features/follow-ups/follow-up-list';
import { spacing } from '@/theme/tokens';

type FollowUpSortSheetProps = {
  visible: boolean;
  sort: FollowUpSort;
  onClose: () => void;
  onSelect: (sort: FollowUpSort) => void;
};

export function FollowUpSortSheet({
  visible,
  sort,
  onClose,
  onSelect,
}: FollowUpSortSheetProps) {
  return (
    <BottomSheet visible={visible} title="Sort by" onClose={onClose}>
      <View style={styles.sortOptions}>
        <PillButton
          tone={sort === 'urgency' ? 'solid' : 'outline'}
          style={styles.sortButton}
          onPress={() => {
            onSelect('urgency');
            onClose();
          }}>
          By urgency
        </PillButton>
        <PillButton
          tone={sort === 'recent' ? 'solid' : 'outline'}
          style={styles.sortButton}
          onPress={() => {
            onSelect('recent');
            onClose();
          }}>
          Most recent
        </PillButton>
        <PillButton
          tone={sort === 'az' ? 'solid' : 'outline'}
          style={styles.sortButton}
          onPress={() => {
            onSelect('az');
            onClose();
          }}>
          Name A–Z
        </PillButton>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sortOptions: { gap: spacing.x2 },
  sortButton: { alignSelf: 'stretch' },
});
