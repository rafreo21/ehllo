import "server-only";

import { transcribe } from "ai";

import {
  groqTranscriptionConfig,
  isTranscriptionConfigured,
  prepareAiAuth,
  transcriptionModel,
  usesDirectOpenAi,
  usesGroqTranscription,
} from "./ai-provider";
import { cleanLiveTranscript } from "./transcript-cleanup";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export type EncounterTranscriptSegment = {
  id: string;
  speaker: string;
  text: string;
  start?: number;
  end?: number;
};

type OpenAiDiarizedPayload = {
  text?: string;
  segments?: Array<{
    id?: string | number;
    speaker?: string;
    text?: string;
    start?: number;
    end?: number;
  }>;
  error?: { message?: string };
};

function guessMimeFromFileName(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3") || lower.endsWith(".mpeg") || lower.endsWith(".mpga")) return "audio/mpeg";
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) return "audio/mp4";
  if (lower.endsWith(".aac")) return "audio/aac";
  if (lower.endsWith(".caf")) return "audio/x-caf";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
  return "audio/mp4";
}

function resolveMimeAndName(options?: { mimeType?: string; fileName?: string }) {
  const fileName = options?.fileName?.trim() || "recording.m4a";
  const mimeType = options?.mimeType?.trim() || guessMimeFromFileName(fileName);
  return { fileName, mimeType };
}

function normalizeDiarizedSegments(payload: OpenAiDiarizedPayload): EncounterTranscriptSegment[] {
  const speakerNumbers = new Map<string, number>();
  return (payload.segments ?? []).flatMap((segment, index) => {
    const text = cleanLiveTranscript(segment.text ?? "");
    if (!text) return [];

    const rawSpeaker = segment.speaker?.trim() || "unknown";
    if (!speakerNumbers.has(rawSpeaker)) speakerNumbers.set(rawSpeaker, speakerNumbers.size + 1);
    const speaker = `Speaker ${speakerNumbers.get(rawSpeaker)}`;
    return [{
      id: String(segment.id ?? `segment-${index + 1}`),
      speaker,
      text,
      start: Number.isFinite(segment.start) ? segment.start : undefined,
      end: Number.isFinite(segment.end) ? segment.end : undefined,
    }];
  });
}

function formatSpeakerTranscript(segments: EncounterTranscriptSegment[]) {
  return segments.map((segment) => `${segment.speaker}: ${segment.text}`).join(" ").trim();
}

async function requestOpenAiTranscription(
  audio: Uint8Array,
  options: { language?: string; mimeType: string; fileName: string; diarize: boolean },
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from(audio)], { type: options.mimeType }),
    options.fileName,
  );
  form.append("model", options.diarize ? "gpt-4o-transcribe-diarize" : "whisper-1");
  if (options.diarize) {
    form.append("response_format", "diarized_json");
    form.append("chunking_strategy", "auto");
  }
  if (options.language) form.append("language", options.language);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const payload = await response.json().catch(() => null) as OpenAiDiarizedPayload | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI transcription failed (${response.status}).`);
  }
  return payload ?? {};
}

/** Prefer durable speaker labels, but preserve the existing Whisper path as a no-break fallback. */
async function transcribeWithOpenAi(
  audio: Uint8Array,
  options: { language?: string; mimeType: string; fileName: string },
) {
  try {
    const payload = await requestOpenAiTranscription(audio, { ...options, diarize: true });
    const segments = normalizeDiarizedSegments(payload);
    if (segments.length) {
      return {
        text: formatSpeakerTranscript(segments),
        segments,
        diarized: true,
      };
    }
  } catch {
    // A provider/model issue must not make recording capture unusable.
  }

  const payload = await requestOpenAiTranscription(audio, { ...options, diarize: false });
  return {
    text: payload.text?.trim() || "",
    segments: [] as EncounterTranscriptSegment[],
    diarized: false,
  };
}

/** Groq hosts open-source Whisper behind an OpenAI-compatible endpoint - same multipart shape, free tier, no billing-account requirement. */
async function transcribeWithGroqWhisper(
  audio: Uint8Array,
  options: { language?: string; mimeType: string; fileName: string },
) {
  const { apiKey, model } = groqTranscriptionConfig();
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured.");

  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from(audio)], { type: options.mimeType }),
    options.fileName,
  );
  form.append("model", model);
  if (options.language) form.append("language", options.language);

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const payload = await response.json().catch(() => null) as { text?: string; error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Groq transcription failed (${response.status}).`);
  }
  return payload?.text?.trim() || "";
}

export async function transcribeEncounterAudio(
  audio: Uint8Array,
  options?: { language?: string; mimeType?: string; fileName?: string },
): Promise<{
  transcript: string;
  source: "ai" | "unavailable";
  unavailable?: string;
  diarized: boolean;
  speakers: string[];
  segments: EncounterTranscriptSegment[];
}> {
  if (audio.byteLength === 0) {
    throw new Error("Audio file is empty.");
  }

  if (audio.byteLength > MAX_AUDIO_BYTES) {
    throw new Error("Recording is larger than 25 MB. Choose a shorter or compressed recording.");
  }

  if (!(await isTranscriptionConfigured())) {
    throw new Error("Server transcription is not configured yet. Add OPENAI_API_KEY, or paste a transcript manually.");
  }

  await prepareAiAuth();

  const language = options?.language?.trim().slice(0, 12);
  const { fileName, mimeType } = resolveMimeAndName(options);

  try {
    const transcription = usesGroqTranscription()
      ? { text: await transcribeWithGroqWhisper(audio, { language, mimeType, fileName }), diarized: false, segments: [] as EncounterTranscriptSegment[] }
      : usesDirectOpenAi()
        ? await transcribeWithOpenAi(audio, { language, mimeType, fileName })
        : { text: (await transcribe({
            model: transcriptionModel(),
            audio,
            providerOptions: language ? { openai: { language } } : undefined,
          })).text.trim(), diarized: false, segments: [] as EncounterTranscriptSegment[] };

    const transcript = cleanLiveTranscript(transcription.text);
    if (!transcript) {
      return {
        transcript: "",
        source: "unavailable",
        unavailable: "empty_transcript",
        diarized: false,
        speakers: [],
        segments: [],
      };
    }

    return {
      transcript,
      source: "ai",
      diarized: transcription.diarized,
      speakers: [...new Set(transcription.segments.map((segment) => segment.speaker))],
      segments: transcription.segments,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not transcribe this recording.";
    throw new Error(message);
  }
}
