import { readOfflineScanQueue, type OfflineScanEntry } from '@/features/connections/offline-scan-queue';
import { listPendingTranscriptionDrafts } from '@/features/encounters/capture-transcription-sync';
import { readFollowUpQueue, type FollowUpQueueEntry } from '@/features/follow-ups/follow-up-cache';
import { readQuickFollowUpQueue, type QuickFollowUpQueueEntry } from '@/features/follow-ups/quick-follow-up-queue';
import { readEventActionQueue, type EventActionQueueEntry } from '@/features/events/event-action-queue';

export type PendingSyncStatus = {
  scans: OfflineScanEntry[];
  quickFollowUps: QuickFollowUpQueueEntry[];
  followUpActions: FollowUpQueueEntry[];
  transcriptions: Awaited<ReturnType<typeof listPendingTranscriptionDrafts>>;
  eventActions: EventActionQueueEntry[];
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
  return {
    scans,
    quickFollowUps,
    followUpActions,
    transcriptions,
    eventActions,
    total: scans.length + quickFollowUps.length + followUpActions.length + transcriptions.length + eventActions.length,
  };
}
