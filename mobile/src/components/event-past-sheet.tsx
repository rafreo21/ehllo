import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Button } from '@/components/ui';
import { canRejoinEvent } from '@/features/events/event-home-state';
import type { EventItem } from '@/features/events/events-api';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

function whenLabel(event: EventItem) {
  const start = new Date(event.startsAt);
  if (Number.isNaN(start.getTime())) return '';
  return start.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * The one sheet every row in Past opens.
 *
 * What it offers is decided by whether the event can still be attended, not by
 * which group the row was filed under, so the two can never disagree. An event
 * still to come can be rejoined in a single tap - that is the whole point of
 * keeping declined events visible. An event that has finished can only be
 * recreated: editing its date would silently rewrite history that captures and
 * follow-ups are already attached to.
 */
export function EventPastSheet({
  event,
  busy,
  onClose,
  onRejoin,
  onRecreate,
  onRemove,
}: {
  event: EventItem | null;
  busy: boolean;
  onClose: () => void;
  onRejoin: (event: EventItem) => void;
  onRecreate: (event: EventItem) => void;
  onRemove: (event: EventItem) => void;
}) {
  if (!event) return null;

  const rejoinable = canRejoinEvent(event);
  const cancelled = event.status === 'cancelled';
  const when = whenLabel(event);

  const explanation = cancelled
    ? 'This event was cancelled.'
    : rejoinable
      ? "You said you're not going. It hasn't happened yet, so you can still change your mind."
      : event.attendanceStatus === 'going'
        ? 'This event has finished.'
        : "This event has finished, and you didn't go.";

  return (
    <BottomSheet visible title={event.title} onClose={onClose}>
      <View style={styles.body}>
        {when ? <Text style={styles.when}>{when}</Text> : null}
        {event.location ? <Text style={styles.location}>{event.location}</Text> : null}
        <Text style={styles.explanation}>{explanation}</Text>

        <View style={styles.actions}>
          {rejoinable ? (
            <Button onPress={() => onRejoin(event)} loading={busy}>
              I&rsquo;m going after all
            </Button>
          ) : (
            <Button onPress={() => onRecreate(event)} disabled={busy}>
              Create a new event from this
            </Button>
          )}
          <Button variant="ghost" onPress={() => onRemove(event)} disabled={busy}>
            Remove from my events
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.x1,
  },
  when: {
    color: colors.ink,
    fontSize: 15,
    fontFamily: fonts.semibold, fontWeight: '600',
  },
  location: { fontFamily: fonts.regular,
    color: colors.muted,
    fontSize: 14, },
  explanation: { fontFamily: fonts.regular,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.medium,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.x2,
    padding: spacing.x4, },
  actions: {
    gap: spacing.x2,
    marginTop: spacing.x5,
  },
});
