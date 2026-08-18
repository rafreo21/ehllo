import { useAuth } from '@/features/auth/auth-context';
import { buildEncounterPayload, saveEncounter } from '@/features/encounters/encounter-api';
import { dequeueQuickFollowUp, readQuickFollowUpQueue } from '@/features/follow-ups/quick-follow-up-queue';
import { useForegroundSync } from '@/lib/background-sync';
import { isOnline } from '@/lib/connectivity';
import { clearSyncFailure, recordSyncFailure, syncFailureKey } from '@/features/sync/sync-failure-store';

// Mounted globally, same reasoning as FollowUpSyncManager and
// OfflineScanSyncManager - a Quick Follow-up saved while offline queues
// instead of failing, and this links it in for real the next time
// connectivity comes back, without the user redoing any data entry.
export function QuickFollowUpSyncManager() {
  const { session } = useAuth();
  const accessToken = session?.access_token;

  useForegroundSync(Boolean(accessToken), async () => {
    if (!accessToken || !isOnline()) return;
    const queue = await readQuickFollowUpQueue();
    for (const entry of queue) {
      try {
        const encounter = buildEncounterPayload({
          transcript: '',
          title: `Follow-up with ${entry.personName}`,
          personName: entry.personName,
          personEmail: entry.personEmail,
          people: [{
            id: entry.sourceId || undefined,
            name: entry.personName,
            email: entry.personEmail,
            exchangeId: entry.exchangeId || undefined,
          }],
          contactId: entry.contactId || undefined,
          exchangeId: entry.exchangeId || undefined,
          sharedSummary: '',
          privateNotes: '',
          manualFollowUps: entry.followUps.map((item) => ({
            title: item.title,
            channel: item.channel,
            owner: item.owner,
            targetPersonId: '',
            dueAt: item.dueAt,
          })),
          consentConfirmed: false,
          status: 'reviewed',
          durationSeconds: 0,
          startedAt: entry.eventSnapshot?.occurredAt ?? entry.queuedAt,
          eventId: entry.eventSnapshot?.eventId,
        });
        await saveEncounter(accessToken, encounter);
        await dequeueQuickFollowUp(entry.id);
        await clearSyncFailure(syncFailureKey.quickFollowUp(entry.id));
      } catch (error) {
        await recordSyncFailure(syncFailureKey.quickFollowUp(entry.id), error);
      }
    }
  });

  return null;
}
