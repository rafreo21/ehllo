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
 * Returns whether this device now holds an actively registered push token -
 * the only state that should ever be described to the user as "push is on."
 */
export async function registerPushToken(accessToken: string): Promise<boolean> {
  // Every one of these exits used to return false and say nothing, and the caller
  // discards the boolean too - so an account with no push token was
  // indistinguishable from an account that had never tried, on device and in the
  // logs alike. Someone can turn notifications on, believe it worked, and there is
  // no way to find out where it stopped. Still best-effort: registration must
  // never block app usage, so nothing here throws or changes the return.
  const fail = (reason: string, extra?: Record<string, unknown>) => {
    console.warn('[push-token] not registered', { reason, platform: Platform.OS, ...extra });
    return false;
  };

  const projectId = easProjectId();
  if (!projectId) return fail('no EAS project id in this build');
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return fail('unsupported platform');
  if (!await notificationPermissionGranted()) return fail('notification permission not granted');

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
        deviceLabel: Device.deviceName || Device.modelName || (Platform.OS === 'ios' ? 'iOS device' : 'Android device'),
        deviceModel: Device.modelName || '',
      }),
    });
    if (!response.ok) return fail('server rejected the token', { status: response.status });
    return true;
  } catch (caught) {
    return fail('registration threw', {
      message: caught instanceof Error ? caught.message : String(caught),
    });
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
