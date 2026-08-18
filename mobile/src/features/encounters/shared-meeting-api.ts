import { readEnv } from '@/lib/env';
import { mobileFetch, readMobileApiJson } from '@/lib/mobile-api';

/**
 * Opening a meeting somebody else recorded, from inside the app.
 *
 * Deliberately the same pipeline as the emailed guest link rather than a parallel
 * one. The server hands an entitled participant the share token, and from there
 * this uses the endpoints the web guest view already uses - so the payload, the
 * "only once shared" rule and the three day recording window are enforced in one
 * place instead of two that can drift.
 */
export type SharedMeeting = {
  id: string;
  title: string;
  personName: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  sharedSummary: string;
  /** Present only while the recording is still inside its retention window. */
  hasRecording: boolean;
  recordingExpiresAt: string | null;
};

export class SharedMeetingUnavailableError extends Error {}

function apiBase() {
  const base = readEnv()?.publicCardBaseUrl;
  if (!base) throw new Error('ehllo API URL is not configured.');
  return base.replace(/\/$/, '');
}

/** The audio stream for a shared meeting. Token-authorised, so no header needed. */
export function sharedRecordingUri(shareToken: string) {
  return `${apiBase()}/api/encounters/share/${encodeURIComponent(shareToken)}/recording`;
}

export async function fetchSharedMeeting(
  accessToken: string,
  encounterId: string,
): Promise<{ meeting: SharedMeeting; shareToken: string }> {
  const tokenResponse = await mobileFetch(
    `/api/encounters/${encodeURIComponent(encounterId)}/share-token`,
    accessToken,
  );
  const tokenPayload = await readMobileApiJson<{ shareToken?: string; error?: string; code?: string }>(
    tokenResponse,
    'Could not read the meeting access response.',
  );
  if (!tokenResponse.ok || !tokenPayload.shareToken) {
    // A meeting that has not been shared is a settled answer, not a fault: the
    // owner has reviewed it but not approved it for anyone else to read.
    throw new SharedMeetingUnavailableError(
      tokenPayload.error || 'This meeting has not been shared with you.',
    );
  }
  const shareToken = tokenPayload.shareToken;

  const response = await fetch(
    `${apiBase()}/api/encounters/share/${encodeURIComponent(shareToken)}`,
    { headers: { Accept: 'application/json' } },
  );
  const payload = await response.json().catch(() => null) as
    | { encounter?: Record<string, unknown>; error?: string }
    | null;
  if (!response.ok || !payload?.encounter) {
    throw new SharedMeetingUnavailableError(payload?.error || 'This meeting is not available.');
  }

  const encounter = payload.encounter;
  const recording = (encounter.recording ?? null) as Record<string, unknown> | null;

  return {
    shareToken,
    meeting: {
      id: String(encounter.id ?? encounterId),
      title: String(encounter.title ?? 'Meeting'),
      personName: String(encounter.personName ?? ''),
      startedAt: String(encounter.startedAt ?? ''),
      endedAt: String(encounter.endedAt ?? ''),
      durationSeconds: typeof encounter.durationSeconds === 'number' ? encounter.durationSeconds : 0,
      sharedSummary: String(encounter.sharedSummary ?? ''),
      // The server already withholds an expired recording, so its presence here
      // is the answer - no second expiry calculation on the client to disagree.
      hasRecording: Boolean(recording && (recording.sharedAudioUrl || recording.storagePath || recording.id)),
      recordingExpiresAt: typeof recording?.cloudExpiresAt === 'string'
        ? recording.cloudExpiresAt
        : typeof recording?.expiresAt === 'string' ? recording.expiresAt : null,
    },
  };
}
