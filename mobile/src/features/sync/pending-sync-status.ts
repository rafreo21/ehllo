import { readOfflineScanQueue, type OfflineScanEntry } from '@/features/connections/offline-scan-queue';
import { listPendingTranscriptionDrafts } from '@/features/encounters/capture-transcription-sync';
import { readFollowUpQueue, type FollowUpQueueEntry } from '@/features/follow-ups/follow-up-cache';
import { readQuickFollowUpQueue, type QuickFollowUpQueueEntry } from '@/features/follow-ups/quick-follow-up-queue';

export type PendingSyncStatus = {
  scans: OfflineScanEntry[];
  quickFollowUps: QuickFollowUpQueueEntry[];
  followUpActions: FollowUpQueueEntry[];
  transcriptions: Awaited<ReturnType<typeof listPendingTranscriptionDrafts>>;
  total: number;
};

export async function readPendingSyncStatus(): Promise<PendingSyncStatus> {
  const [scans, quickFollowUps, followUpActions, transcriptions] = await Promise.all([
    readOfflineScanQueue(),
    readQuickFollowUpQueue(),
    readFollowUpQueue(),
    listPendingTranscriptionDrafts(),
  ]);
  return {
    scans,
    quickFollowUps,
    followUpActions,
    transcriptions,
    total: scans.length + quickFollowUps.length + followUpActions.length + transcriptions.length,
  };
}
