import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getCaptureDeviceIdentity } from '@/features/encounters/capture-draft';
import { mobileFetch, readMobileApiJson } from '@/lib/mobile-api';
import { notificationPermissionGranted } from '@/features/notifications/notification-service';

/** EAS project identity comes from the environment-specific Expo config. */
function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId
    || Constants.easConfig?.projectId
    || process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    || undefined;
}

export function pushDeliveryConfigured(): boolean {
  return Boolean(easProjectId());
}

/**
 * Returns whether this device now holds an actively registered push token —
 * the only state that should ever be described to the user as "push is on."
 */
export async function registerPushToken(accessToken: string): Promise<boolean> {
  const projectId = easProjectId();
  if (!projectId) return false;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  if (!await notificationPermissionGranted()) return false;

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const device = await getCaptureDeviceIdentity();

    const response = await mobileFetch('/api/notifications/push-tokens', accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: device.id,
        platform: Platform.OS,
        expoPushToken: tokenResponse.data,
        deviceLabel: Platform.OS === 'ios' ? 'iPhone' : 'Android device',
        deviceModel: Device.modelName || '',
      }),
    });
    return response.ok;
  } catch {
    // Registration is best-effort — a missing/rotated token must never block app usage.
    return false;
  }
}

export async function deactivatePushToken(accessToken: string): Promise<void> {
  try {
    const device = await getCaptureDeviceIdentity();
    const response = await mobileFetch(
      `/api/notifications/push-tokens?deviceId=${encodeURIComponent(device.id)}`,
      accessToken,
      { method: 'DELETE' },
    );
    await readMobileApiJson(response, 'Could not deactivate this device.').catch(() => undefined);
  } catch {
    // Best-effort cleanup on sign-out.
  }
}
