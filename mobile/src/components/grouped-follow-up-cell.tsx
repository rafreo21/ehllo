import { ArrowCounterClockwise, CaretRight, Check } from 'phosphor-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { channelLabel } from '@/features/follow-ups/action-links';
import { displayFollowUpTitle, type FollowUpChannel } from '@/features/follow-ups/follow-up-channels';
import type { FollowUpGroup } from '@/features/follow-ups/follow-up-groups';
import { dueTone, formatDueLabel } from '@/lib/due-date';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

type GroupedFollowUpCellProps = {
  group: FollowUpGroup;
  onPress: () => void;
  onComplete: () => void;
  onReopen?: () => void;
  completing?: boolean;
};

function channelSummary(items: FollowUpGroup['items']) {
  return items.map((item) => channelLabel(item.channel)).join(' · ');
}

export function GroupedFollowUpCell({
  group,
  onPress,
  onComplete,
  onReopen,
  completing,
}: GroupedFollowUpCellProps) {
  const isCompleted = group.items.every((item) => item.status === 'completed');
  const dueLabel = formatDueLabel(group.dueAt);
  const tone = isCompleted ? 'default' : dueTone(group.dueAt);
  const subtitle = group.items.length > 1
    ? channelSummary(group.items)
    : displayFollowUpTitle(
      group.items[0]?.title || '',
      (group.items[0]?.channel || 'email') as FollowUpChannel,
    );

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {group.personName.trim() || 'Contact'}
            </Text>
            {group.owner === 'guest' ? <Text style={styles.ownerTag}>Their turn</Text> : null}
          </View>
          <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
          {group.encounterTitle ? (
            <Text style={styles.meta} numberOfLines={1}>{group.encounterTitle}</Text>
          ) : null}
          {group.eventTitle ? (
            <Text style={styles.eventMeta} numberOfLines={1}>At {group.eventTitle}</Text>
          ) : null}
        </View>
        {isCompleted ? (
          <Text style={styles.dueCompleted}>{completedLabel(group.completedAt)}</Text>
        ) : dueLabel ? (
          <Text style={[
            styles.due,
            tone === 'overdue' && styles.dueOverdue,
            tone === 'today' && styles.dueToday,
          ]}>
            {dueLabel}
          </Text>
        ) : null}
        {group.items.length > 1 ? (
          <CaretRight size={16} color={colors.muted} weight="bold" />
        ) : null}
      </Pressable>
      {group.items.length === 1 ? (
        isCompleted ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reopen completed follow-up"
            disabled={completing || !onReopen}
            onPress={onReopen}
            style={({ pressed }) => [styles.check, pressed && styles.pressed]}>
            <ArrowCounterClockwise size={18} color={colors.ink} weight="bold" />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark follow-up done"
            disabled={completing}
            onPress={onComplete}
            style={({ pressed }) => [styles.check, pressed && styles.pressed]}>
            <Check size={18} color={colors.muted} weight="bold" />
          </Pressable>
        )
      ) : null}
    </View>
  );
}

function completedLabel(value?: string) {
  if (!value) return 'Completed';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Completed';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function GroupedFollowUpActions({
  group,
  onPressItem,
  onCompleteItem,
  onReopenItem,
  completingId,
}: {
  group: FollowUpGroup;
  onPressItem: (actionId: string) => void;
  onCompleteItem: (actionId: string) => void;
  onReopenItem?: (actionId: string) => void;
  completingId?: string | null;
}) {
  return (
    <View style={actionStyles.list}>
      {group.items.map((item) => (
        <View key={item.actionId} style={actionStyles.row}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onPressItem(item.actionId)}
            style={({ pressed }) => [actionStyles.main, pressed && actionStyles.pressed]}>
            <Text style={actionStyles.label}>{channelLabel(item.channel)}</Text>
            <Text style={actionStyles.copy}>
              {displayFollowUpTitle(item.title, item.channel as FollowUpChannel)}
            </Text>
          </Pressable>
          {item.status === 'completed' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reopen completed follow-up"
              disabled={!onReopenItem}
              onPress={() => onReopenItem?.(item.actionId)}
              style={({ pressed }) => [actionStyles.check, pressed && actionStyles.pressed]}>
              <ArrowCounterClockwise size={18} color={colors.ink} weight="bold" />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mark follow-up done"
              disabled={completingId === `${item.encounterId}-${item.actionId}`}
              onPress={() => onCompleteItem(item.actionId)}
              style={({ pressed }) => [actionStyles.check, pressed && actionStyles.pressed]}>
              <Check size={18} color={colors.muted} weight="bold" />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x4,
  },
  pressed: { opacity: 0.82 },
  copy: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  title: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, fontWeight: '800' },
  ownerTag: {
    color: colors.ink,
    fontSize: 9,
    fontFamily: fonts.bold, fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
    overflow: 'hidden',
  },
  subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  meta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  eventMeta: { color: colors.inkSoft, fontSize: 11, fontFamily: fonts.medium, fontWeight: '700', lineHeight: 16 },
  due: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, fontWeight: '700' },
  dueOverdue: { color: colors.danger },
  dueToday: { color: colors.warning },
  dueCompleted: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, fontWeight: '700' },
  check: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    backgroundColor: colors.canvas,
  },
});

const actionStyles = StyleSheet.create({
  list: { gap: spacing.x3 },
  row: {
    flexDirection: 'row',
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  main: { flex: 1, gap: 2, padding: spacing.x4 },
  pressed: { opacity: 0.82 },
  label: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, fontWeight: '800' },
  copy: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  check: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    backgroundColor: colors.canvas,
  },
});
