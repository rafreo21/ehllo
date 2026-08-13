import { useAuth } from '@/features/auth/auth-context';
import {
  completeFollowUp,
  dismissFollowUp,
  reopenFollowUp,
  snoozeFollowUp,
} from '@/features/follow-ups/follow-up-api';
import { dequeueFollowUpAction, readFollowUpQueue } from '@/features/follow-ups/follow-up-cache';
import { useForegroundSync } from '@/lib/background-sync';
import { isOnline } from '@/lib/connectivity';

// Mounted globally rather than scoped to the follow-ups screen — actions can
// also be queued from notifications.tsx and connections/[id].tsx, and the
// app could background right after.
export function FollowUpSyncManager() {
  const { session } = useAuth();
  const accessToken = session?.access_token;

  useForegroundSync(Boolean(accessToken), async () => {
    if (!accessToken || !isOnline()) return;
    const queue = await readFollowUpQueue();
    for (const entry of queue) {
      try {
        if (entry.action === 'complete') await completeFollowUp(accessToken, entry.encounterId, entry.actionId);
        else if (entry.action === 'snooze' && entry.snoozedUntil) {
          await snoozeFollowUp(accessToken, entry.encounterId, entry.actionId, entry.snoozedUntil);
        } else if (entry.action === 'dismiss') {
          await dismissFollowUp(accessToken, entry.encounterId, entry.actionId);
        } else await reopenFollowUp(accessToken, entry.encounterId, entry.actionId);
        await dequeueFollowUpAction(entry.encounterId, entry.actionId);
      } catch {
        // Leave queued; retry next cycle.
      }
    }
  });

  return null;
}
