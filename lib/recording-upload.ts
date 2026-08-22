import type { LocalRecordingMetadata } from "./local-recordings";
import { audioFileExtension } from "./audio-format";

function guessFileName(mimeType: string, encounterId: string) {
  return `${encounterId}.${audioFileExtension(mimeType)}`;
}

export async function uploadEncounterRecording(
  encounterId: string,
  blob: Blob,
  mimeType = "audio/mp4",
): Promise<LocalRecordingMetadata> {
  const formData = new FormData();
  formData.append("audio", blob, guessFileName(mimeType, encounterId));

  const response = await fetch(`/api/encounters/${encodeURIComponent(encounterId)}/recording`, {
    method: "POST",
    body: formData,
  });

  const payload = await response.json().catch(() => ({})) as {
    ok?: boolean;
    error?: string;
    code?: string;
    retryable?: boolean;
    recording?: LocalRecordingMetadata;
  };

  if (!response.ok || !payload.ok || !payload.recording) {
    const error = new Error(payload.error || (response.status === 401
      ? "Your session has expired. Sign in again; your local recording is safe."
      : response.status === 413
        ? "This recording is too large to upload for sharing. Your local copy is safe."
        : "The recording could not be uploaded for sharing. Your local copy is safe-check your connection and retry."));
    Object.assign(error, { code: payload.code, retryable: payload.retryable ?? response.status >= 500 });
    throw error;
  }

  return {
    id: encounterId,
    durationSeconds: payload.recording.durationSeconds ?? 0,
    fileSize: payload.recording.fileSize ?? blob.size,
    mimeType: payload.recording.mimeType || mimeType,
    source: payload.recording.source === "imported" ? "imported" : "recorded",
    retention: payload.recording.retention ?? "7_days",
    expiresAt: payload.recording.expiresAt ?? null,
    createdAt: payload.recording.createdAt ?? new Date().toISOString(),
    audioLocation: "server",
    storagePath: payload.recording.storagePath,
    sharedAudioUrl: payload.recording.sharedAudioUrl,
    cloudExpiresAt: payload.recording.cloudExpiresAt ?? null,
  };
}
