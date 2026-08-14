import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import { fetchFollowUps } from '@/features/follow-ups/follow-up-api';
import {
  configureNotificationChannel,
  deviceNotificationsEnabled,
  recordNotification,
  syncFollowUpNotifications,
} from '@/features/notifications/notification-service';
import { addFollowUpNotificationSyncListener } from '@/features/notifications/notification-sync-events';
import { registerPushToken } from '@/features/notifications/push-token-service';

function openNotificationRoute(notification: Notifications.Notification) {
  const data = notification.request.content.data as { route?: unknown } | undefined;
  if (typeof data?.route === 'string') router.push(data.route as '/settings/follow-ups');
}

export function NotificationManager() {
  const { session } = useAuth();
  const accessToken = session?.access_token;

  useEffect(() => {
    void configureNotificationChannel();

    const received = Notifications.addNotificationReceivedListener((notification) => {
      void recordNotification(notification);
    });
    const responded = Notifications.addNotificationResponseReceivedListener((response) => {
      void recordNotification(response.notification);
      openNotificationRoute(response.notification);
    });

    const launchResponse = Notifications.getLastNotificationResponse();
    if (launchResponse) {
      void recordNotification(launchResponse.notification);
      setTimeout(() => openNotificationRoute(launchResponse.notification), 0);
      Notifications.clearLastNotificationResponse();
    }

    return () => {
      received.remove();
      responded.remove();
    };
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    async function sync() {
      if (!await deviceNotificationsEnabled()) return;
      const followUps = await fetchFollowUps(accessToken!);
      await syncFollowUpNotifications(followUps);
    }

    async function registerIfEnabled() {
      if (!await deviceNotificationsEnabled()) return;
      await registerPushToken(accessToken!);
    }

    void sync().catch(() => undefined);
    void registerIfEnabled().catch(() => undefined);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void sync().catch(() => undefined);
        void registerIfEnabled().catch(() => undefined);
      }
    });
    const interval = setInterval(() => void sync().catch(() => undefined), 15 * 60 * 1_000);
    const changed = addFollowUpNotificationSyncListener(() => void sync().catch(() => undefined));
    return () => {
      appState.remove();
      changed.remove();
      clearInterval(interval);
    };
  }, [accessToken]);

  return null;
}
