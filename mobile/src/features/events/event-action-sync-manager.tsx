import { useAuth } from '@/features/auth/auth-context';
import { dequeueEventAction, readEventActionQueue } from '@/features/events/event-action-queue';
import { sendEventAttendance, sendEventCheckIn, sendEventLeft } from '@/features/events/events-api';
import { useForegroundSync } from '@/lib/background-sync';
import { isOnline } from '@/lib/connectivity';
import { clearSyncFailure, recordSyncFailure, syncFailureKey } from '@/features/sync/sync-failure-store';

export function EventActionSyncManager() {
  const { session } = useAuth();
  const accessToken = session?.access_token;

  useForegroundSync(Boolean(accessToken), async () => {
    if (!accessToken || !isOnline()) return;
    const queue = await readEventActionQueue();
    for (const entry of queue) {
      try {
        if (entry.action === 'attendance' && entry.attendanceStatus) {
          await sendEventAttendance(accessToken, entry.eventId, entry.attendanceStatus);
        } else if (entry.action === 'leave') {
          await sendEventLeft(accessToken, entry.eventId, entry.left !== false);
        } else if (entry.action === 'check_in') {
          await sendEventCheckIn(accessToken, entry.eventId, entry.checkedIn !== false);
        }
        await dequeueEventAction(entry.eventId, entry.action);
        await clearSyncFailure(syncFailureKey.eventAction(entry.eventId, entry.action));
      } catch (error) {
        await recordSyncFailure(syncFailureKey.eventAction(entry.eventId, entry.action), error);
      }
    }
  });

  return null;
}
