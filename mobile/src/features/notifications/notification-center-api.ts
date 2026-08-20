import { mobileFetch, readMobileApiJson } from '@/lib/mobile-api';

export type NotificationType =
  | 'review_ready'
  | 'follow_up_due'
  | 'follow_up_overdue'
  | 'shared_meeting_update'
  | 'connection_added'
  | 'keep_in_touch'
  | 'contact_request'
  | 'follow_up_completed';

export type NotificationRecord = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  encounterId: string | null;
  actionId: string;
  readAt: string | null;
  createdAt: string;
};

export async function fetchNotifications(accessToken: string): Promise<{ notifications: NotificationRecord[]; unreadCount: number }> {
  const response = await mobileFetch('/api/notifications', accessToken);
  const payload = await readMobileApiJson<{ notifications?: NotificationRecord[]; unreadCount?: number; error?: string }>(
    response,
    'Could not load your notifications.',
  );
  if (!response.ok) throw new Error(payload.error || 'Could not load your notifications.');
  return { notifications: payload.notifications ?? [], unreadCount: payload.unreadCount ?? 0 };
}

export async function markNotificationRead(accessToken: string, id: string): Promise<void> {
  const response = await mobileFetch('/api/notifications', accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const payload = await readMobileApiJson<{ ok?: boolean; error?: string }>(response, 'Could not update this notification.');
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not update this notification.');
}

export async function markAllNotificationsRead(accessToken: string): Promise<void> {
  const response = await mobileFetch('/api/notifications', accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markAllRead: true }),
  });
  const payload = await readMobileApiJson<{ ok?: boolean; error?: string }>(response, 'Could not update your notifications.');
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not update your notifications.');
}

export type NotificationPreferences = Record<NotificationType, boolean>;

export async function fetchNotificationPreferences(accessToken: string): Promise<NotificationPreferences> {
  const response = await mobileFetch('/api/settings/notifications', accessToken);
  const payload = await readMobileApiJson<{ notificationPreferences?: NotificationPreferences; error?: string }>(
    response,
    'Could not load your notification preferences.',
  );
  if (!response.ok) throw new Error(payload.error || 'Could not load your notification preferences.');
  return payload.notificationPreferences ?? {
    review_ready: true,
    follow_up_due: true,
    follow_up_overdue: true,
    shared_meeting_update: true,
    connection_added: true,
    keep_in_touch: true,
    contact_request: true,
    follow_up_completed: true,
  };
}

export async function updateNotificationPreferences(
  accessToken: string,
  preferences: NotificationPreferences,
): Promise<void> {
  const response = await mobileFetch('/api/settings/notifications', accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notificationPreferences: preferences }),
  });
  const payload = await readMobileApiJson<{ error?: string }>(response, 'Could not update your notification preferences.');
  if (!response.ok) throw new Error(payload.error || 'Could not update your notification preferences.');
}

/**
 * Sends the chosen reminder times to the account.
 *
 * They have always lived only in AsyncStorage, which is right for the notifications this
 * phone schedules for itself and wrong for the one digest the server sends: the server had
 * no idea what you had chosen, so it went out at a fixed hour to everybody and you could
 * be reminded at an hour you had explicitly not picked.
 *
 * Best effort on purpose. The device's own reminders are already set by the time this
 * runs, so a failed sync must not undo a setting that has visibly taken effect - it only
 * means the server digest lags behind until the next change.
 */
export async function syncReminderTimesToAccount(
  accessToken: string,
  reminderTimes: string[],
): Promise<void> {
  const response = await mobileFetch('/api/settings/notifications', accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reminderTimes }),
  });
  if (!response.ok) {
    const payload = await readMobileApiJson<{ error?: string }>(response, 'Could not sync your reminder times.');
    throw new Error(payload.error || 'Could not sync your reminder times.');
  }
}

export function notificationDeepLink(notification: NotificationRecord): string | null {
  if (notification.type === 'connection_added') return '/connections';
  // Somebody asked you for a detail. There is no incoming-requests screen yet, so
  // this lands on People, where the person who asked can be found - a tap that
  // arrives somewhere useful beats a notification that cannot be opened at all.
  // Straight to where it can be answered. This pointed at People as a placeholder
  // while there was no screen to answer one.
  // open=1 so the answer sheet is already up on arrival. Landing on the list and making
  // you find the row you were just told about is a second search for the same thing.
  if (notification.type === 'contact_request') return '/settings/contact-requests?open=1';
  // Straight to the follow-up that was ticked off, when we know which one.
  if (notification.type === 'follow_up_completed') return '/settings/follow-ups';
  if (notification.type === 'keep_in_touch') {
    const [source, sourceId] = notification.actionId.split(':');
    if ((source === 'met' || source === 'inbound') && sourceId) {
      return `/connections/${encodeURIComponent(`${source}-${sourceId}`)}`;
    }
    return '/connections';
  }
  if (!notification.encounterId) return null;
  switch (notification.type) {
    case 'review_ready':
    case 'shared_meeting_update':
      return `/capture/${notification.encounterId}`;
    case 'follow_up_due':
    case 'follow_up_overdue':
      return `/capture/${notification.encounterId}`;
    default:
      return null;
  }
}
