export type CaptureErrorCode =
  | "session_expired"
  | "audio_missing"
  | "audio_too_large"
  | "audio_unsupported"
  | "transcription_not_configured"
  | "transcription_quota"
  | "transcription_rate_limited"
  | "transcription_unavailable"
  | "recording_storage_not_configured"
  | "recording_storage_full"
  | "recording_upload_failed"
  | "recording_metadata_failed";

export type CaptureErrorResponse = {
  error: string;
  code: CaptureErrorCode;
  retryable: boolean;
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

export function classifyTranscriptionError(error: unknown): CaptureErrorResponse & { status: number } {
  const raw = errorText(error);
  const message = raw.toLowerCase();

  if (/larger than 25 mb|too large|maximum.*size|request entity too large/.test(message)) {
    return {
      status: 413,
      code: "audio_too_large",
      retryable: false,
      error: "This recording is too large to transcribe. Keep the local copy and choose a shorter or compressed recording.",
    };
  }
  if (/unsupported|invalid.*audio|audio.*format|decode|corrupt/.test(message)) {
    return {
      status: 415,
      code: "audio_unsupported",
      retryable: false,
      error: "This audio format could not be read. Keep the original and try an M4A, MP3, WAV, or WebM recording.",
    };
  }
  if (/not configured|api[_ -]?key|missing.*key/.test(message)) {
    return {
      status: 503,
      code: "transcription_not_configured",
      retryable: false,
      error: "Automatic transcription is not configured right now. Your recording is safe; add notes manually or try again after setup.",
    };
  }
  if (/quota|insufficient_quota|billing|credit balance|exceeded.*limit/.test(message)) {
    return {
      status: 503,
      code: "transcription_quota",
      retryable: true,
      error: "Automatic transcription has temporarily reached its usage limit. Your recording is safe-retry later or continue with manual notes.",
    };
  }
  if (/rate.?limit|too many requests|429/.test(message)) {
    return {
      status: 429,
      code: "transcription_rate_limited",
      retryable: true,
      error: "Transcription is busy right now. Your recording is safe-wait a moment, then retry.",
    };
  }
  return {
    status: 503,
    code: "transcription_unavailable",
    retryable: true,
    error: "Transcription is temporarily unavailable. Your recording is safe-retry later or continue with manual notes.",
  };
}

export function classifyRecordingUploadError(error: unknown): CaptureErrorResponse & { status: number } {
  const message = errorText(error).toLowerCase();
  if (/quota|storage.*full|exceeded.*limit|insufficient.*storage/.test(message)) {
    return {
      status: 507,
      code: "recording_storage_full",
      retryable: false,
      error: "Shared recording storage is full. Your local recording is safe; free storage or download it before trying again.",
    };
  }
  if (/payload too large|too large|maximum.*size|413/.test(message)) {
    return {
      status: 413,
      code: "audio_too_large",
      retryable: false,
      error: "This recording is too large to upload for sharing. Your local copy is safe; use a shorter or compressed recording.",
    };
  }
  return {
    status: 502,
    code: "recording_upload_failed",
    retryable: true,
    error: "The recording could not be uploaded for sharing. Your local copy is safe-check your connection and retry.",
  };
}
