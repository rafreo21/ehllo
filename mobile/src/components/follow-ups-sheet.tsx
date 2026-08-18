import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { GroupedFollowUpActions, GroupedFollowUpCell } from '@/components/grouped-follow-up-cell';
import { PillButton } from '@/components/ui';
import type { FollowUpItem } from '@/features/follow-ups/follow-up-api';
import type { FollowUpGroup } from '@/features/follow-ups/follow-up-groups';
import {
  buildFollowUpGroups,
  filterFollowUpGroups,
  sortFollowUpGroups,
} from '@/features/follow-ups/follow-up-list';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

type FollowUpsSheetProps = {
  visible: boolean;
  title?: string;
  items: FollowUpItem[];
  onClose: () => void;
  onPressItem: (item: FollowUpItem) => void;
  onCompleteItem: (item: FollowUpItem) => void;
  onReopenItem?: (item: FollowUpItem) => void;
  completingId?: string | null;
};

type SortMode = 'urgency' | 'recent';

export function FollowUpsSheet({
  visible,
  title = 'Follow-ups',
  items,
  onClose,
  onPressItem,
  onCompleteItem,
  onReopenItem,
  completingId,
}: FollowUpsSheetProps) {
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('urgency');
  const [activeGroup, setActiveGroup] = useState<FollowUpGroup | null>(null);
  const showTools = items.length > 10;

  const filtered = useMemo(() => {
    const currentGroups = buildFollowUpGroups(items, 'current');
    return sortFollowUpGroups(filterFollowUpGroups(currentGroups, query), sortMode);
  }, [items, query, sortMode]);

  function runGroup(group: FollowUpGroup) {
    // Close this sheet before opening the next one - whether that's the
    // action directly or the grouped-actions list - two RN <Modal>
    // instances visible at once hangs on iOS.
    onClose();
    if (group.items.length === 1) {
      onPressItem(group.items[0]);
      return;
    }
    setActiveGroup(group);
  }

  return (
    <>
      <BottomSheet visible={visible} title={title} onClose={onClose}>
        {showTools ? (
          <View style={styles.tools}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search follow-ups"
              placeholderTextColor={colors.muted}
              style={styles.search}
            />
            <View style={styles.sortRow}>
              <PillButton
                tone={sortMode === 'urgency' ? 'solid' : 'outline'}
                style={styles.sortButton}
                onPress={() => setSortMode('urgency')}>
                By urgency
              </PillButton>
              <PillButton
                tone={sortMode === 'recent' ? 'solid' : 'outline'}
                style={styles.sortButton}
                onPress={() => setSortMode('recent')}>
                Most recent
              </PillButton>
            </View>
          </View>
        ) : null}

        {filtered.length ? (
          <View style={styles.list}>
            {filtered.map((group) => (
              <GroupedFollowUpCell
                key={group.id}
                group={group}
                onPress={() => runGroup(group)}
                onComplete={() => {
                  const item = group.items[0];
                  if (item) onCompleteItem(item);
                }}
                onReopen={onReopenItem ? () => {
                  const item = group.items[0];
                  if (item) onReopenItem(item);
                } : undefined}
                completing={group.items.length === 1 && completingId === `${group.items[0]?.encounterId}-${group.items[0]?.actionId}`}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>{query.trim() ? 'No follow-ups match your search.' : 'No current follow-ups.'}</Text>
        )}
      </BottomSheet>

      <BottomSheet
        visible={Boolean(activeGroup)}
        title={activeGroup?.personName.trim() || 'Follow-up actions'}
        onClose={() => setActiveGroup(null)}>
        {activeGroup ? (
          <GroupedFollowUpActions
            group={activeGroup}
            completingId={completingId}
            onPressItem={(actionId) => {
              const item = activeGroup.items.find((entry) => entry.actionId === actionId);
              // Close both this sheet and the outer list sheet before running the
              // action - it may open another sheet (missing contact info, audience
              // choice), and two RN <Modal> instances visible at once hangs on iOS.
              setActiveGroup(null);
              onClose();
              if (item) onPressItem(item);
            }}
            onCompleteItem={(actionId) => {
              const item = activeGroup.items.find((entry) => entry.actionId === actionId);
              if (item) onCompleteItem(item);
            }}
            onReopenItem={onReopenItem ? (actionId) => {
              const item = activeGroup.items.find((entry) => entry.actionId === actionId);
              if (item) onReopenItem(item);
            } : undefined}
          />
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  tools: { gap: spacing.x3 },
  search: { fontFamily: fonts.regular,
    minHeight: 48,
    paddingHorizontal: spacing.x4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    color: colors.ink,
    backgroundColor: colors.canvas, },
  sortRow: { flexDirection: 'row', gap: spacing.x2 },
  sortButton: { flex: 1, alignSelf: 'stretch' },
  list: { gap: spacing.x3 },
  empty: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
});
