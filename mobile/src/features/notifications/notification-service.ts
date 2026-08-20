import { scopedStorage as AsyncStorage } from '@/lib/scoped-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { FollowUpItem } from '@/features/follow-ups/follow-up-api';

const ENABLED_KEY = 'aftermeet-device-notifications-enabled-v1';
const SCHEDULE_KEY = 'aftermeet-follow-up-notification-schedule-v1';
const HISTORY_KEY = 'aftermeet-notification-history-v1';
const REMINDER_TIME_KEY = 'aftermeet-follow-up-reminder-time-v1';
const CHANNEL_ID = 'follow-ups';
const MAX_HISTORY = 40;

type ScheduledReminder = {
  identifiers: string[];
  dueAt: string;
  /** Sorted, so a stored set can be compared to a chosen one without re-sorting. */
  reminderTimes: string[];
  /** Written by the single-time version. Still read so its notification gets cancelled. */
  identifier?: string;
  reminderTime?: string;
};

/**
 * Every identifier a stored record stands for, including the single one written
 * before times became a set. Without the legacy field an upgraded install would
 * leave its old notification scheduled and fire twice.
 */
function scheduledIdentifiers(record: ScheduledReminder | undefined) {
  if (!record) return [];
  return [...(record.identifiers ?? []), ...(record.identifier ? [record.identifier] : [])];
}

async function cancelScheduled(record: ScheduledReminder | undefined) {
  await Promise.all(scheduledIdentifiers(record).map((identifier) =>
    Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined)));
}

export const REMINDER_TIME_OPTIONS = ['09:00', '12:00', '17:00'] as const;
export type ReminderTime = typeof REMINDER_TIME_OPTIONS[number];

export type NotificationHistoryItem = {
  id: string;
  title: string;
  body: string;
  receivedAt: string;
  route: string;
  readAt?: string;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function followUpKey(item: FollowUpItem) {
  return `${item.encounterId}:${item.actionId}`;
}

/**
 * The moment a reminder should fire, or null if that moment has gone.
 *
 * This used to return `now + 5 seconds` for a time already past, which is why the
 * chosen times were not respected: a follow-up due today, with 09:00 selected, would
 * ping the instant the app was opened at five in the afternoon. Picking a time and
 * being interrupted immediately is worse than not being reminded - the overdue
 * notification already covers "this needed doing".
 */
function reminderDate(dueAt: string, reminderTime: ReminderTime) {
  const due = new Date(`${dueAt.slice(0, 10)}T${reminderTime}:00`);
  if (Number.isNaN(due.getTime())) return null;
  if (due.getTime() <= Date.now()) return null;
  return due;
}

const REMINDER_TIMES_KEY = 'aftermeet-follow-up-reminder-times-v1';

function sortTimes(values: ReminderTime[]): ReminderTime[] {
  return REMINDER_TIME_OPTIONS.filter((option) => values.includes(option));
}

/**
 * The times a reminder should fire, in order.
 *
 * More than one on purpose: a single slot means a follow-up due today is either
 * caught at that hour or not at all. Falls back to the old single-value key so
 * nobody's existing choice is lost, and to 09:00 for anyone who never picked.
 */
export async function followUpReminderTimes(): Promise<ReminderTime[]> {
  const stored = await AsyncStorage.getItem(REMINDER_TIMES_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) {
        const valid = sortTimes(parsed.filter((value): value is ReminderTime =>
          REMINDER_TIME_OPTIONS.includes(value as ReminderTime)));
        if (valid.length) return valid;
      }
    } catch {
      // fall through to the legacy key
    }
  }
  const legacy = await AsyncStorage.getItem(REMINDER_TIME_KEY);
  if (REMINDER_TIME_OPTIONS.includes(legacy as ReminderTime)) return [legacy as ReminderTime];
  return ['09:00'];
}

/**
 * Never stores an empty set: no times at all is indistinguishable from reminders
 * being broken, and the switch above it is what turns them off.
 */
export async function setFollowUpReminderTimes(values: ReminderTime[]) {
  const next = sortTimes(values);
  await AsyncStorage.setItem(REMINDER_TIMES_KEY, JSON.stringify(next.length ? next : ['09:00']));
}

async function readSchedule(): Promise<Record<string, ScheduledReminder>> {
  try {
    return JSON.parse(await AsyncStorage.getItem(SCHEDULE_KEY) || '{}') as Record<string, ScheduledReminder>;
  } catch {
    return {};
  }
}

async function writeSchedule(schedule: Record<string, ScheduledReminder>) {
  await AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
}

export async function configureNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Follow-up reminders',
    description: 'Reminders for follow-ups you chose in ehllo.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 180, 250],
    lightColor: '#9FE870',
    showBadge: true,
  });
}

export async function notificationPermissionGranted() {
  const permission = await Notifications.getPermissionsAsync();
  return permission.granted
    || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function requestNotificationPermission() {
  await configureNotificationChannel();
  const permission = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return permission.granted
    || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function deviceNotificationsEnabled() {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === 'true';
}

export async function setDeviceNotificationsEnabled(enabled: boolean) {
  await AsyncStorage.setItem(ENABLED_KEY, String(enabled));
  if (!enabled) await clearFollowUpNotifications();
}

export async function clearFollowUpNotifications() {
  const schedule = await readSchedule();
  await Promise.all(Object.values(schedule).map((item) => cancelScheduled(item)));
  await writeSchedule({});
  await Notifications.setBadgeCountAsync(0).catch(() => false);
}

export async function syncFollowUpNotifications(items: FollowUpItem[]) {
  if (!await deviceNotificationsEnabled() || !await notificationPermissionGranted()) return;
  await configureNotificationChannel();

  const open = items.filter((item) => item.owner === 'me' && item.status !== 'completed');
  const withDueDate = open.filter((item) => item.dueAt.trim());
  const previous = await readSchedule();
  const next: Record<string, ScheduledReminder> = {};
  const reminderTimes = await followUpReminderTimes();

  for (const item of withDueDate) {
    const key = followUpKey(item);
    const existing = previous[key];
    // Same due date and same set of times means the existing schedule already says
    // what we would say. Comparing the set, not one value, is what makes this hold
    // when several times are chosen.
    if (existing?.dueAt === item.dueAt
      && existing.reminderTimes?.length === reminderTimes.length
      && existing.reminderTimes.every((time, index) => time === reminderTimes[index])) {
      next[key] = { identifiers: existing.identifiers, dueAt: existing.dueAt, reminderTimes };
      continue;
    }
    if (existing) await cancelScheduled(existing);

    // One notification per chosen time. The identifier carries the time, or each
    // schedule would overwrite the last and only the final slot would survive.
    const identifiers: string[] = [];
    for (const reminderTime of reminderTimes) {
      const date = reminderDate(item.dueAt, reminderTime);
      if (!date) continue;
      const identifier = await Notifications.scheduleNotificationAsync({
        identifier: `aftermeet-followup-${item.encounterId}-${item.actionId}-${reminderTime}`,
        content: {
          title: `Follow up with ${item.personName.trim() || 'your connection'}`,
          body: item.title.trim() || 'You have a follow-up waiting in ehllo.',
          sound: 'default',
          badge: open.length,
          data: {
            type: 'follow-up',
            route: '/settings/follow-ups',
            encounterId: item.encounterId,
            actionId: item.actionId,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
        },
      });
      identifiers.push(identifier);
    }
    // Recorded even when empty - every chosen time for this due date is in the past -
    // so the next sync does not retry it on every foreground.
    next[key] = { identifiers, dueAt: item.dueAt, reminderTimes };
  }

  for (const [key, existing] of Object.entries(previous)) {
    if (!next[key]) await cancelScheduled(existing);
  }

  await writeSchedule(next);
  await Notifications.setBadgeCountAsync(open.length).catch(() => false);
}

export async function recordNotification(notification: Notifications.Notification) {
  const content = notification.request.content;
  const data = content.data as { route?: unknown } | undefined;
  const item: NotificationHistoryItem = {
    id: notification.request.identifier,
    title: content.title || 'ehllo reminder',
    body: content.body || '',
    receivedAt: new Date().toISOString(),
    route: typeof data?.route === 'string' ? data.route : '/settings/follow-ups',
  };
  await storeNotificationHistoryItem(item);
}

async function readNotificationHistory(): Promise<NotificationHistoryItem[]> {
  try {
    return JSON.parse(await AsyncStorage.getItem(HISTORY_KEY) || '[]') as NotificationHistoryItem[];
  } catch {
    return [];
  }
}

async function storeNotificationHistoryItem(item: NotificationHistoryItem) {
  const current = await readNotificationHistory();
  const isNew = !current.some((entry) => entry.id === item.id);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([
    item,
    ...current.filter((entry) => entry.id !== item.id),
  ].slice(0, MAX_HISTORY)));
  return isNew;
}

export async function notifyMeetingReviewReady(input: { encounterId: string; title?: string }) {
  const identifier = `aftermeet-review-ready-${input.encounterId}`;
  const route = `/capture/new?draftId=${encodeURIComponent(input.encounterId)}`;
  const meetingTitle = input.title?.trim() || 'Your meeting';
  const item: NotificationHistoryItem = {
    id: identifier,
    title: 'Transcript ready',
    body: `${meetingTitle} is ready to review. Your follow-up choices are saved.`,
    receivedAt: new Date().toISOString(),
    route,
  };

  const isNew = await storeNotificationHistoryItem(item);
  if (!isNew) return false;

  if (await deviceNotificationsEnabled() && await notificationPermissionGranted()) {
    await configureNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: item.title,
        body: item.body,
        sound: 'default',
        data: {
          type: 'meeting-review-ready',
          route,
          encounterId: input.encounterId,
        },
      },
      trigger: null,
    }).catch(() => undefined);
  }

  return true;
}

export async function scheduledFollowUpCount() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.filter((item) => item.content.data?.type === 'follow-up').length;
}
