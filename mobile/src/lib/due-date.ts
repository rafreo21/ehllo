export type DuePreset = 'none' | 'today' | 'tomorrow' | 'in_3_days' | 'in_1_week' | 'custom';

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  return copy;
}

function endOfWeek(date: Date) {
  const copy = startOfDay(date);
  const day = copy.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  copy.setDate(copy.getDate() + daysUntilSunday);
  return copy;
}

function addDays(from: Date, days: number) {
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return next;
}

export function dueDateFromPreset(preset: DuePreset, customDate = ''): string {
  const now = startOfDay(new Date());
  switch (preset) {
    case 'today':
      return toIsoDate(now);
    case 'tomorrow':
      return toIsoDate(addDays(now, 1));
    case 'in_3_days':
      return toIsoDate(addDays(now, 3));
    case 'in_1_week':
      return toIsoDate(addDays(now, 7));
    case 'custom':
      return customDate.trim().slice(0, 10);
    default:
      return '';
  }
}

export function inferDuePreset(dueAt: string): DuePreset {
  if (!dueAt.trim()) return 'none';
  const iso = dueAt.trim().slice(0, 10);
  const presets: DuePreset[] = ['today', 'tomorrow', 'in_3_days', 'in_1_week'];
  for (const preset of presets) {
    if (dueDateFromPreset(preset) === iso) return preset;
  }
  return 'custom';
}

export const DUE_PRESETS: { id: DuePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'in_3_days', label: 'In 3 days' },
  { id: 'in_1_week', label: 'In 1 week' },
  { id: 'custom', label: 'Pick date' },
];

export function formatDueLabel(dueAt: string, now = new Date()): string | null {
  if (!dueAt.trim()) return null;
  const due = startOfDay(new Date(`${dueAt.slice(0, 10)}T12:00:00`));
  const today = startOfDay(now);
  if (Number.isNaN(due.getTime())) return null;
  if (due < today) {
    const days = Math.max(1, Math.round((today.getTime() - due.getTime()) / 86_400_000));
    return days === 1 ? 'Overdue 1d' : `Overdue ${days}d`;
  }
  if (due.getTime() === today.getTime()) return 'Today';
  const tomorrow = addDays(today, 1);
  if (due.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function dueTone(dueAt: string, now = new Date()): 'overdue' | 'today' | 'default' {
  if (!dueAt.trim()) return 'default';
  const due = startOfDay(new Date(`${dueAt.slice(0, 10)}T12:00:00`));
  const today = startOfDay(now);
  if (due < today) return 'overdue';
  if (due.getTime() === today.getTime()) return 'today';
  return 'default';
}

export function sortFollowUps<T extends { dueAt: string; startedAt: string }>(items: T[]): T[] {
  const bucket = (dueAt: string) => {
    if (!dueAt.trim()) return 4;
    const due = startOfDay(new Date(`${dueAt.slice(0, 10)}T12:00:00`));
    const today = startOfDay(new Date());
    if (due < today) return 0;
    if (due.getTime() === today.getTime()) return 1;
    if (due <= endOfWeek(today)) return 2;
    return 3;
  };

  return [...items].sort((left, right) => {
    const leftBucket = bucket(left.dueAt);
    const rightBucket = bucket(right.dueAt);
    if (leftBucket !== rightBucket) return leftBucket - rightBucket;
    if (left.dueAt && right.dueAt && left.dueAt !== right.dueAt) {
      return left.dueAt.localeCompare(right.dueAt);
    }
    return right.startedAt.localeCompare(left.startedAt);
  });
}

export function formatMeetingDate(startedAt: string) {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return 'Meeting';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatCustomDueDate(isoDate: string) {
  const date = startOfDay(new Date(`${isoDate.slice(0, 10)}T12:00:00`));
  if (Number.isNaN(date.getTime())) return 'Pick a date';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function shiftDueDate(isoDate: string, days: number) {
  const base = startOfDay(new Date(`${isoDate.slice(0, 10)}T12:00:00`));
  if (Number.isNaN(base.getTime())) return dueDateFromPreset('in_3_days');
  return toIsoDate(addDays(base, days));
}
