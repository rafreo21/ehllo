import { CalendarBlank, CaretRight, NotePencil, UserPlus } from 'phosphor-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { PillButton } from '@/components/ui';
import type { EventItem } from '@/features/events/events-api';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

function formatEventWhen(startsAt: string) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '';
  const datePart = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

export type EventCardVariant = 'current' | 'going' | 'candidate' | 'past';

/**
 * The one event card component — used on Home (at most one, whichever state
 * resolveHomeEventCardState picks) and in My Events (one per row). Keeping a
 * single component means the two screens can never visually drift apart.
 */
export function EventCard({
  event,
  variant,
  busy,
  onPress,
  onGoing,
  onNotGoing,
  onLeave,
  onCheckIn,
  onInvite,
  onManage,
}: {
  event: EventItem;
  variant: EventCardVariant;
  busy?: boolean;
  onPress?: () => void;
  onGoing?: (event: EventItem) => void;
  onNotGoing?: (event: EventItem) => void;
  onLeave?: (event: EventItem) => void;
  onCheckIn?: (event: EventItem) => void;
  onInvite?: (event: EventItem) => void;
  onManage?: (event: EventItem) => void;
}) {
  const when = formatEventWhen(event.startsAt);
  const showCandidateActions = variant === 'candidate';
  const showLeaveAction = variant === 'current' && Boolean(onLeave);
  // "I'm here" is offered on an event that is actually running and not yet
  // confirmed. Until someone confirms, which of two overlapping events owns a
  // scanned card is decided by whichever started later — a guess. Once
  // confirmed the card says so, because the useful information at that point
  // is which event your scans are being filed under, not that a button exists.
  const checkedIn = Boolean(event.checkedInAt);
  // Never on a candidate: you cannot be at something you have not said you
  // are going to, and offering "I'm here" beside "Going / Not going" asks two
  // different questions in one row.
  const showCheckInAction = Boolean(onCheckIn) && !checkedIn && variant !== 'candidate';
  const showGoingNotGoingAction = (variant === 'going' || variant === 'current') && Boolean(onNotGoing);
  // Independent of the action row below — this is Home's "tap the card to
  // see it in My Events" affordance. Events itself never passes onPress, so
  // this never shows there even when the same variant has action buttons.
  const showCaret = variant !== 'past' && Boolean(onPress);

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, onPress && pressed && styles.cardPressed]}>
      <View style={styles.topRow}>
        <View style={styles.icon}>
          <CalendarBlank size={20} color={colors.ink} weight="bold" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta} numberOfLines={1}>
              {when}{event.location ? ` · ${event.location}` : ''}
            </Text>
            {variant === 'current' ? (
              <View style={styles.statusTag}><Text style={styles.statusText}>You&apos;re here</Text></View>
            ) : null}
            {variant === 'going' ? (
              <View style={styles.statusTag}><Text style={styles.statusText}>Going</Text></View>
            ) : null}
            {showCandidateActions ? (
              <Text style={styles.suggested} numberOfLines={1}>
                {event.source === 'calendar' ? 'From calendar' : 'Added by you'}
              </Text>
            ) : null}
          </View>
        </View>
        {showCaret ? <CaretRight size={14} color={colors.muted} weight="bold" /> : null}
      </View>
      {showCandidateActions ? (
        <View style={styles.actionRow}>
          {busy ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <View style={styles.actions}>
              {showCheckInAction ? (
                <PillButton
                  tone="solid"
                  accessibilityLabel="I'm here at this event"
                  onPress={(nativeEvent) => { nativeEvent.stopPropagation(); onCheckIn?.(event); }}>
                  I&apos;m here
                </PillButton>
              ) : null}
              {onInvite ? (
                <PillButton
                  tone="outline"
                  icon={<UserPlus size={15} color={colors.ink} weight="bold" />}
                  onPress={(nativeEvent) => { nativeEvent.stopPropagation(); onInvite(event); }}>
                  Invite
                </PillButton>
              ) : null}
              <PillButton
                tone="solid"
                onPress={(nativeEvent) => { nativeEvent.stopPropagation(); onGoing?.(event); }}>
                Going
              </PillButton>
              <PillButton
                tone="outline"
                onPress={(nativeEvent) => { nativeEvent.stopPropagation(); onNotGoing?.(event); }}>
                Not going
              </PillButton>
            </View>
          )}
        </View>
      ) : null}
      {showLeaveAction ? (
        <View style={styles.actionRow}>
          {busy ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <View style={styles.actions}>
              {showCheckInAction ? (
                <PillButton
                  tone="solid"
                  accessibilityLabel="I'm here at this event"
                  onPress={(nativeEvent) => { nativeEvent.stopPropagation(); onCheckIn?.(event); }}>
                  I&apos;m here
                </PillButton>
              ) : null}
              {checkedIn ? (
                <Text style={styles.checkedInNote} accessibilityRole="text">
                  You&apos;re here · scans file to this event
                </Text>
              ) : null}
              <PillButton
                tone="outline"
                accessibilityLabel="I've left this event"
                onPress={(nativeEvent) => { nativeEvent.stopPropagation(); onLeave?.(event); }}>
                I&apos;ve left
              </PillButton>
              {showGoingNotGoingAction ? (
                <PillButton
                  tone="outline"
                  onPress={(nativeEvent) => { nativeEvent.stopPropagation(); onNotGoing?.(event); }}>
                  Not going
                </PillButton>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
      {showGoingNotGoingAction && !showLeaveAction ? (
        <View style={styles.actionRow}>
          {busy ? <ActivityIndicator color={colors.ink} /> : (
            <View style={styles.actions}>
              {onInvite ? (
                <PillButton
                  tone="outline"
                  icon={<UserPlus size={15} color={colors.ink} weight="bold" />}
                  onPress={(nativeEvent) => { nativeEvent.stopPropagation(); onInvite(event); }}>
                  Invite
                </PillButton>
              ) : null}
              {onManage ? (
                <PillButton
                  tone="outline"
                  icon={<NotePencil size={15} color={colors.ink} weight="bold" />}
                  onPress={(nativeEvent) => { nativeEvent.stopPropagation(); onManage(event); }}>
                  Manage
                </PillButton>
              ) : null}
              <PillButton tone="outline" onPress={(nativeEvent) => { nativeEvent.stopPropagation(); onNotGoing?.(event); }}>Not going</PillButton>
            </View>
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
  },
  cardPressed: { opacity: 0.92 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  // Indented to start under the title/meta text (icon width + topRow gap),
  // not the icon — a full-width right-aligned row left an orphaned gap
  // under the icon that read as a layout mistake.
  actionRow: { flexDirection: 'row', marginTop: spacing.x3, marginLeft: 40 + spacing.x3 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  meta: { flexShrink: 1, color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  statusTag: {
    flexShrink: 0,
    paddingHorizontal: spacing.x2,
    paddingVertical: 3,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
  },
  statusText: { color: colors.ink, fontSize: 10, fontFamily: fonts.bold, fontWeight: '800', textTransform: 'uppercase' },
  suggested: { flexShrink: 0, color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.x2 },
  checkedInNote: { color: colors.muted, fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600' },
});
