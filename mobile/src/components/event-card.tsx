import { CalendarBlank, CaretRight } from 'phosphor-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { EventItem } from '@/features/events/events-api';
import { colors, radius, spacing } from '@/theme/tokens';

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
}: {
  event: EventItem;
  variant: EventCardVariant;
  busy?: boolean;
  onPress?: () => void;
  onGoing?: (event: EventItem) => void;
  onNotGoing?: (event: EventItem) => void;
  onLeave?: (event: EventItem) => void;
}) {
  const when = formatEventWhen(event.startsAt);
  const showCandidateActions = variant === 'candidate';
  const showLeaveAction = variant === 'current' && Boolean(onLeave);
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
            {showCandidateActions ? <Text style={styles.suggested} numberOfLines={1}>From calendar</Text> : null}
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
              <Pressable
                accessibilityRole="button"
                onPress={(nativeEvent) => { nativeEvent.stopPropagation(); onGoing?.(event); }}
                style={styles.actionPrimary}>
                <Text style={styles.actionPrimaryText}>Going</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={(nativeEvent) => { nativeEvent.stopPropagation(); onNotGoing?.(event); }}
                style={styles.actionGhost}>
                <Text style={styles.actionGhostText}>Not going</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
      {showLeaveAction ? (
        <View style={styles.actionRow}>
          {busy ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="I've left this event"
              onPress={(nativeEvent) => { nativeEvent.stopPropagation(); onLeave?.(event); }}
              style={styles.actionGhost}>
              <Text style={styles.actionGhostText}>I&apos;ve left</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.x4,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
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
  title: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  meta: { flexShrink: 1, color: colors.muted, fontSize: 12 },
  statusTag: {
    flexShrink: 0,
    paddingHorizontal: spacing.x2,
    paddingVertical: 3,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
  },
  statusText: { color: colors.ink, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  suggested: { flexShrink: 0, color: colors.muted, fontSize: 12 },
  actions: { flexDirection: 'row', gap: spacing.x2 },
  actionPrimary: {
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x2,
    borderRadius: radius.round,
    backgroundColor: colors.ink,
  },
  actionPrimaryText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  actionGhost: {
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x2,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actionGhostText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
});
