export type EventAttendanceChoice = 'going' | 'not_going';

export type EventActionStateEntry = {
  eventId: string;
  action: 'attendance' | 'leave' | 'check_in';
  attendanceStatus?: EventAttendanceChoice;
  left?: boolean;
  checkedIn?: boolean;
  queuedAt: string;
};

export function mergeEventActionQueue(
  current: EventActionStateEntry[],
  entry: Omit<EventActionStateEntry, 'queuedAt'>,
  queuedAt = new Date().toISOString(),
) {
  const next = current.filter((item) => !(item.eventId === entry.eventId && item.action === entry.action));
  // Declining an event you had queued a presence action for makes that
  // presence action meaningless - drop both rather than replaying "I'm here"
  // for something you have since said you are not attending.
  const compatible = entry.action === 'attendance' && entry.attendanceStatus === 'not_going'
    ? next.filter((item) => !(item.eventId === entry.eventId && (item.action === 'leave' || item.action === 'check_in')))
    : next;

  // Only one place at a time: a queued check-in anywhere else is stale the
  // moment the user checks in somewhere new, exactly as the server clears it.
  const single = entry.action === 'check_in' && entry.checkedIn !== false
    ? compatible.filter((item) => !(item.action === 'check_in' && item.eventId !== entry.eventId))
    : compatible;
  return [...single, { ...entry, queuedAt }];
}
