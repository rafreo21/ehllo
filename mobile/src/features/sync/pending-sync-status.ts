import { readOfflineScanQueue, type OfflineScanEntry } from '@/features/connections/offline-scan-queue';
import { listPendingTranscriptionDrafts } from '@/features/encounters/capture-transcription-sync';
import { readFollowUpQueue, type FollowUpQueueEntry } from '@/features/follow-ups/follow-up-cache';
import { readQuickFollowUpQueue, type QuickFollowUpQueueEntry } from '@/features/follow-ups/quick-follow-up-queue';
import { readEventActionQueue, type EventActionQueueEntry } from '@/features/events/event-action-queue';
import { retainSyncFailures, syncFailureKey, type SyncFailure } from '@/features/sync/sync-failure-store';

export type PendingSyncItem = {
  key: string;
  category: 'scan' | 'quick-follow-up' | 'follow-up-action' | 'transcription' | 'event-action';
  title: string;
  detail: string;
  queuedAt: string;
  failure?: SyncFailure;
};

export type PendingSyncStatus = {
  scans: OfflineScanEntry[];
  quickFollowUps: QuickFollowUpQueueEntry[];
  followUpActions: FollowUpQueueEntry[];
  transcriptions: Awaited<ReturnType<typeof listPendingTranscriptionDrafts>>;
  eventActions: EventActionQueueEntry[];
  items: PendingSyncItem[];
  total: number;
};

export async function readPendingSyncStatus(): Promise<PendingSyncStatus> {
  const [scans, quickFollowUps, followUpActions, transcriptions, eventActions] = await Promise.all([
    readOfflineScanQueue(),
    readQuickFollowUpQueue(),
    readFollowUpQueue(),
    listPendingTranscriptionDrafts(),
    readEventActionQueue(),
  ]);
  const itemRows: PendingSyncItem[] = [
    ...scans.map((item) => ({ key: syncFailureKey.scan(item.slug), category: 'scan' as const, title: 'Connection scan', detail: item.slug, queuedAt: item.queuedAt })),
    ...quickFollowUps.map((item) => ({ key: syncFailureKey.quickFollowUp(item.id), category: 'quick-follow-up' as const, title: `Follow-up with ${item.personName || 'a connection'}`, detail: `${item.followUps.length} follow-up${item.followUps.length === 1 ? '' : 's'}`, queuedAt: item.queuedAt })),
    ...followUpActions.map((item) => ({ key: syncFailureKey.followUpAction(item.encounterId, item.actionId), category: 'follow-up-action' as const, title: `${item.action[0].toUpperCase()}${item.action.slice(1)} follow-up`, detail: `Action ${item.actionId.slice(0, 8)}`, queuedAt: item.queuedAt })),
    ...transcriptions.map((item) => ({ key: syncFailureKey.transcription(item.encounterId), category: 'transcription' as const, title: item.title || item.personName || 'Recording transcription', detail: 'Audio is safely stored on this device', queuedAt: item.updatedAt })),
    ...eventActions.map((item) => ({ key: syncFailureKey.eventAction(item.eventId, item.action), category: 'event-action' as const, title: item.action === 'leave' ? 'I’ve left event' : item.attendanceStatus === 'going' ? 'Going to event' : 'Not going to event', detail: `Event ${item.eventId.slice(0, 8)}`, queuedAt: item.queuedAt })),
  ];
  const failures = await retainSyncFailures(new Set(itemRows.map((item) => item.key)));
  const failureByKey = new Map(failures.map((failure) => [failure.key, failure]));
  const items = itemRows.map((item) => ({ ...item, failure: failureByKey.get(item.key) }));
  return {
    scans,
    quickFollowUps,
    followUpActions,
    transcriptions,
    eventActions,
    items,
    total: scans.length + quickFollowUps.length + followUpActions.length + transcriptions.length + eventActions.length,
  };
}
