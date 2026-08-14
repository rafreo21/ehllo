import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

type BuildExtra = {
  buildStamp?: string;
  buildNumber?: number;
};

const extra = (Constants.expoConfig?.extra ?? {}) as BuildExtra;

export const APP_BUILD_STAMP = extra.buildStamp ?? 'dev';
export const APP_BUILD_NUMBER = extra.buildNumber ?? 0;

export function formatBuildLabel() {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  if (!APP_BUILD_NUMBER) return `v${version}`;
  return `v${version} (${APP_BUILD_NUMBER}) · ${APP_BUILD_STAMP}`;
}

function shortUpdateId(updateId: string | null) {
  return updateId ? updateId.slice(0, 8) : 'embedded';
}

/**
 * A compact, user-copyable identity for diagnosing Android/iOS staging drift.
 * Devices should show the same runtime, channel, and update ID after refreshing.
 */
export function formatRuntimeLabel() {
  const channel = Updates.channel ?? 'local';
  const runtime = Updates.runtimeVersion ?? Constants.expoConfig?.version ?? 'unknown';
  return `${channel} · runtime ${runtime} · update ${shortUpdateId(Updates.updateId)}`;
}
