import {
  ArrowCounterClockwise,
  CalendarBlank,
  Check,
  CheckCircle,
  EnvelopeSimple,
  InstagramLogo,
  LinkedinLogo,
  Phone,
  TiktokLogo,
  WhatsappLogo,
  XLogo,
} from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FollowUpItem } from '@/features/follow-ups/follow-up-api';
import { channelLabel } from '@/features/follow-ups/action-links';
import { displayFollowUpTitle, isFollowUpChannel } from '@/features/follow-ups/follow-up-channels';
import { dueTone, formatDueLabel } from '@/lib/due-date';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

type FollowUpCellProps = {
  item: FollowUpItem;
  onPress: () => void;
  onComplete: () => void;
  onReopen?: () => void;
  completing?: boolean;
};

function channelIcon(channel: FollowUpItem['channel']): ReactNode {
  const props = { size: 18, color: colors.ink, weight: 'bold' as const };
  switch (channel) {
    case 'call': return <Phone {...props} />;
    case 'linkedin': return <LinkedinLogo {...props} />;
    case 'email': return <EnvelopeSimple {...props} />;
    case 'meeting': return <CalendarBlank {...props} />;
    case 'whatsapp': return <WhatsappLogo {...props} />;
    case 'instagram': return <InstagramLogo {...props} />;
    case 'x': return <XLogo {...props} />;
    case 'tiktok': return <TiktokLogo {...props} />;
    default: return <EnvelopeSimple {...props} />;
  }
}

export function FollowUpCell({ item, onPress, onComplete, onReopen, completing }: FollowUpCellProps) {
  const isCompleted = item.status === 'completed';
  const dueLabel = formatDueLabel(item.dueAt);
  const tone = isCompleted ? 'default' : dueTone(item.dueAt);

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <View style={styles.iconWrap}>{channelIcon(item.channel)}</View>
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {channelLabel(item.channel)} · {item.personName.trim() || 'Contact'}
            </Text>
            {item.owner === 'guest' ? <Text style={styles.ownerTag}>Their turn</Text> : null}
          </View>
          {item.title ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {isFollowUpChannel(item.channel)
                ? displayFollowUpTitle(item.title, item.channel)
                : item.title}
            </Text>
          ) : null}
        </View>
        {isCompleted ? (
          <Text style={styles.dueCompleted}>{completedLabel(item.completedAt)}</Text>
        ) : dueLabel ? (
          <Text style={[
            styles.due,
            tone === 'overdue' && styles.dueOverdue,
            tone === 'today' && styles.dueToday,
          ]}>
            {dueLabel}
          </Text>
        ) : null}
      </Pressable>
      {isCompleted ? (
        onReopen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reopen completed follow-up"
            disabled={completing}
            onPress={onReopen}
            style={({ pressed }) => [styles.check, pressed && styles.pressed]}>
            <ArrowCounterClockwise size={18} color={colors.ink} weight="bold" />
          </Pressable>
        ) : (
          <View style={styles.check}>
            <CheckCircle size={18} color={colors.muted} weight="fill" />
          </View>
        )
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark follow-up done"
          disabled={completing}
          onPress={onComplete}
          style={({ pressed }) => [styles.check, pressed && styles.pressed]}>
          <Check size={18} color={colors.muted} weight="bold" />
        </Pressable>
      )}
    </View>
  );
}

function completedLabel(value?: string) {
  if (!value) return 'Completed';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Completed';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
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
