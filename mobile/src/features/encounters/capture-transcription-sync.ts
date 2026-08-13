import { getActiveCaptureController } from '@/features/encounters/active-capture-controller';
import { listCaptureDrafts, readCaptureDraft, writeCaptureDraft } from '@/features/encounters/capture-draft';
import { transcribeEncounterAudio } from '@/features/encounters/encounter-api';
import { MIN_USABLE_TRANSCRIPT_LENGTH } from '@/features/encounters/use-capture-recorder';
import { isOnline } from '@/lib/connectivity';

export async function listPendingTranscriptionDrafts() {
  const activeEncounterId = getActiveCaptureController()?.snapshot.encounterId;
  const summaries = await listCaptureDrafts();
  return summaries.filter((summary) => (
    summary.hasLocalAudio
    && summary.transcriptPreview.trim().length < MIN_USABLE_TRANSCRIPT_LENGTH
    && summary.encounterId !== activeEncounterId
  ));
}

export async function flushPendingTranscriptions(accessToken: string): Promise<void> {
  if (!isOnline()) return;

  // The `hasLocalAudio && short transcript` heuristic is the authoritative
  // filter here, not `transcriptPending` alone — if the app is killed in the
  // narrow window after recordingUri is persisted but before the failure is
  // even caught, transcriptPending never gets set. This self-heals that gap.
  const candidates = await listPendingTranscriptionDrafts();

  for (const summary of candidates) {
    const draft = await readCaptureDraft(summary.encounterId);
    if (!draft?.recordingUri.trim()) continue;

    try {
      const result = await transcribeEncounterAudio(accessToken, draft.recordingUri, {
        fileName: draft.importFileName || undefined,
        mimeType: draft.importMimeType || undefined,
      });
      if (!result.transcript?.trim()) {
        await writeCaptureDraft({
          ...draft,
          transcriptPending: true,
          transcriptPendingError: 'No speech detected in this recording.',
        });
        continue;
      }
      const merged = [draft.transcript.trim(), result.transcript.trim()].filter(Boolean).join('\n\n');
      await writeCaptureDraft({
        ...draft,
        transcript: merged,
        transcriptPending: false,
        transcriptPendingError: '',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not transcribe this recording.';
      await writeCaptureDraft({ ...draft, transcriptPending: true, transcriptPendingError: message });
    }
  }
}
