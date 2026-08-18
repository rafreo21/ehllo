import { useAuth } from '@/features/auth/auth-context';
import { connectionFromScannedSlug } from '@/features/connections/connections-api';
import { dequeueOfflineScan, readOfflineScanQueue } from '@/features/connections/offline-scan-queue';
import { useForegroundSync } from '@/lib/background-sync';
import { isOnline } from '@/lib/connectivity';
import { clearSyncFailure, recordSyncFailure, syncFailureKey } from '@/features/sync/sync-failure-store';

// Mounted globally, same reasoning as FollowUpSyncManager - a scan queued
// while offline should link into Connections the moment connectivity comes
// back, without the user needing to re-open the scanner and rescan.
/**
 * Distinguishes "this will never work" from "try again later". Only the former
 * should leave the queue; a flaky venue network must keep its place in line.
 */
function isPermanentScanFailure(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return message.includes("isn't available here")
    || message.includes('different ehllo environment')
    || message.includes('unpublished');
}

export function OfflineScanSyncManager() {
  const { session } = useAuth();
  const accessToken = session?.access_token;

  useForegroundSync(Boolean(accessToken), async () => {
    if (!accessToken || !isOnline()) return;
    const queue = await readOfflineScanQueue();
    for (const entry of queue) {
      try {
        await connectionFromScannedSlug(accessToken, entry.slug, entry.eventSnapshot);
        await dequeueOfflineScan(entry.slug);
        await clearSyncFailure(syncFailureKey.scan(entry.slug));
      } catch (error) {
        await recordSyncFailure(syncFailureKey.scan(entry.slug), error);
        // A card the server cannot find is a permanent answer - it belongs to
        // another environment, or was unpublished. Retrying it forever pins a
        // red "retry failed" row to Pending sync that the user can never clear
        // and can do nothing about, so drop it and keep the recorded reason.
        if (isPermanentScanFailure(error)) {
          await dequeueOfflineScan(entry.slug);
        }
      }
    }
  });

  return null;
}
