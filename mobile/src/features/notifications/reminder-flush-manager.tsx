import { useAuth } from '@/features/auth/auth-context';
import { flushReminderDigest } from '@/features/notifications/notification-center-api';
import { useForegroundSync } from '@/lib/background-sync';

/**
 * Asks the server to send today's reminder digest when its time has come.
 *
 * The digest used to go out at one fixed hour to everybody, because our plan allows a
 * scheduled job to run once a day and a job that wakes once cannot fire at three different
 * local times. So the daily run is the safety net and this is the mechanism - the same
 * arrangement already used for pushing calendar events.
 *
 * Asking is cheap and safe to repeat: the server decides whether it is due from stored
 * preferences and the account's own time zone, and will not send twice in one local day.
 * A quiet answer is the normal answer.
 *
 * Hourly rather than the default half a minute. The answer only changes when the clock
 * passes a chosen time, so anything faster is asking the same question repeatedly and
 * getting the same no.
 */
const HOURLY = 60 * 60 * 1000;

export function ReminderFlushManager() {
  const { session } = useAuth();
  const accessToken = session?.access_token;

  useForegroundSync(Boolean(accessToken), () => {
    if (!accessToken) return;
    // Swallowed: nothing on screen depends on this, and a failed attempt is retried on the
    // next foreground pass or caught by the daily run.
    return flushReminderDigest(accessToken).catch(() => undefined);
  }, HOURLY);

  return null;
}
