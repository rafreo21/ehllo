import { useAuth } from '@/features/auth/auth-context';
import { connectionFromScannedSlug } from '@/features/connections/connections-api';
import { dequeueOfflineScan, readOfflineScanQueue } from '@/features/connections/offline-scan-queue';
import { useForegroundSync } from '@/lib/background-sync';
import { isOnline } from '@/lib/connectivity';
import { clearSyncFailure, recordSyncFailure, syncFailureKey } from '@/features/sync/sync-failure-store';

// Mounted globally, same reasoning as FollowUpSyncManager — a scan queued
// while offline should link into Connections the moment connectivity comes
// back, without the user needing to re-open the scanner and rescan.
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
      }
    }
  });

  return null;
}
