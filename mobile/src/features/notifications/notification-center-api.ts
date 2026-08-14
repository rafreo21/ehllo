import { mobileFetch, readMobileApiJson } from '@/lib/mobile-api';

export type NotificationType =
  | 'review_ready'
  | 'follow_up_due'
  | 'follow_up_overdue'
  | 'shared_meeting_update'
  | 'connection_added'
  | 'keep_in_touch';

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

export function notificationDeepLink(notification: NotificationRecord): string | null {
  if (notification.type === 'connection_added') return '/connections';
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
