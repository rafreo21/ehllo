import { scopedStorage } from '@/lib/scoped-storage';

/**
 * Throws away this account's queued-but-unsynced changes.
 *
 * The escape hatch for a permanently stuck item. Every queue retries, and retrying
 * is right while the failure is transient - but a change queued against server
 * data that no longer exists can never succeed, and until now there was no way
 * out: Pending sync offered "Retry now" and nothing else, so the item sat there
 * failing forever and blocked the work behind it.
 *
 * That is not hypothetical. Resetting an account server-side leaves the device
 * holding queued edits for rows that are gone, and the first thing the user hits
 * is a publish that cannot succeed.
 *
 * Deliberately does NOT touch capture drafts or their recordings. Those hold audio
 * that exists nowhere else yet, so discarding them would destroy the only copy -
 * a queued edit is a lost intention, a lost recording is a lost conversation.
 * Everything here is re-derivable from the server or was a queued intent.
 *
 * Scoped storage means this only ever clears the signed-in account's queues.
 */
const PENDING_QUEUE_KEYS = [
  'aftermeet.mobile.offline-scan-queue.v1',
  'aftermeet.mobile.quick-follow-up-queue.v1',
  'aftermeet.mobile.follow-ups-queue.v1',
  'aftermeet.mobile.event-actions-queue.v1',
  'aftermeet.mobile.card-deletes-queue.v1',
  'aftermeet.mobile.dirty-cards.v1',
  // The failure records that describe the above. Without clearing these the
  // screen keeps showing why something failed after the something is gone.
  'aftermeet.mobile.sync-failures.v1',
];

export async function discardPendingSync(): Promise<{ cleared: number }> {
  let cleared = 0;
  for (const key of PENDING_QUEUE_KEYS) {
    try {
      const existing = await scopedStorage.getItem(key);
      if (existing) cleared += 1;
      await scopedStorage.removeItem(key);
    } catch {
      // One unreadable key must not stop the rest being cleared - the point of
      // this action is to get unstuck.
    }
  }
  return { cleared };
}
