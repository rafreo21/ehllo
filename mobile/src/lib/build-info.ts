import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * What build and bundle this device is actually running.
 *
 * The build number used to come from a hardcoded `extra.buildNumber` in
 * app.config.js. eas.json sets appVersionSource "remote" with autoIncrement, so EAS
 * owns that number and assigns it at build time - the constant was a hand-maintained
 * mirror of a value nobody was maintaining. It said 5 while the installed build was
 * 6, which sent us looking for a failed Play update that had actually succeeded.
 * `buildStamp` was stale the same way, six days behind by the time anyone read it.
 *
 * So this reports only what it can establish at runtime. There is no way to read the
 * installed build number without expo-application, which is a native module: adding
 * it here and shipping over OTA would reference a module the current binary does not
 * contain. If the native build number is wanted on this screen, add expo-application
 * and let it ride with the next native build - never with an update.
 *
 * What is here is enough to identify a device precisely, and is the part that
 * actually drifts: two phones on the same version can be on different JS.
 */
function shortUpdateId(updateId: string | null) {
  return updateId ? updateId.slice(0, 8) : 'embedded';
}

/** Publish time of the running JS bundle, which is what distinguishes two devices on one version. */
function updateStamp() {
  const createdAt = Updates.createdAt;
  if (!createdAt) return 'embedded';
  return createdAt.toISOString().replace('T', ' ').slice(0, 16);
}

export function formatBuildLabel() {
  return `v${Constants.expoConfig?.version ?? 'unknown'}`;
}

/**
 * A compact, copyable identity for diagnosing Android/iOS staging drift. Two devices
 * that have both refreshed should agree on every field here.
 */
export function formatRuntimeLabel() {
  const channel = Updates.channel ?? 'local';
  const runtime = Updates.runtimeVersion ?? Constants.expoConfig?.version ?? 'unknown';
  return `${channel} · runtime ${runtime} · update ${shortUpdateId(Updates.updateId)} · ${updateStamp()}`;
}

/** The version string attached to error reports, so a crash can be traced to one bundle. */
export function reportableAppVersion() {
  return `${Constants.expoConfig?.version ?? 'unknown'} · ${Updates.channel ?? 'local'} · update ${shortUpdateId(Updates.updateId)}`;
}
