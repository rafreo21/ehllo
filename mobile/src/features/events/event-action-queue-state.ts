export type EventAttendanceChoice = 'going' | 'not_going';

export type EventActionStateEntry = {
  eventId: string;
  action: 'attendance' | 'leave';
  attendanceStatus?: EventAttendanceChoice;
  left?: boolean;
  queuedAt: string;
};

export function mergeEventActionQueue(
  current: EventActionStateEntry[],
  entry: Omit<EventActionStateEntry, 'queuedAt'>,
  queuedAt = new Date().toISOString(),
) {
  const next = current.filter((item) => !(item.eventId === entry.eventId && item.action === entry.action));
  const compatible = entry.action === 'attendance' && entry.attendanceStatus === 'not_going'
    ? next.filter((item) => !(item.eventId === entry.eventId && item.action === 'leave'))
    : next;
  return [...compatible, { ...entry, queuedAt }];
}
