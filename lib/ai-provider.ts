import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

import { isAiGatewayConfigured, refreshAiGatewayAuth } from "./ai-gateway-auth";

function openAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

function anthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY?.trim() || "";
}

function groqApiKey() {
  return process.env.GROQ_API_KEY?.trim() || "";
}

function geminiApiKey() {
  // GOOGLE_GENERATIVE_AI_API_KEY is the name the AI SDK's Google provider reads by
  // default, so honouring it first means the plain `google(...)` path keeps working
  // for anything that bypasses this module. The branded alias exists because every
  // other provider here has one.
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || process.env.EHLLO_GEMINI_API_KEY?.trim() || "";
}

function brandedEnv(name: string, legacyName: string) {
  return process.env[name]?.trim() || process.env[legacyName]?.trim() || "";
}

function transcriptionProvider() {
  return brandedEnv("EHLLO_TRANSCRIPTION_PROVIDER", "AFTERMEET_TRANSCRIPTION_PROVIDER").toLowerCase();
}

/** EHLLO_TRANSCRIPTION_PROVIDER=groq routes audio transcription to Groq. The former AfterMeet variable remains a fallback during migration. */
export function usesGroqTranscription() {
  return transcriptionProvider() === "groq" && Boolean(groqApiKey());
}

/**
 * EHLLO_TRANSCRIPTION_PROVIDER=gemini routes audio transcription to Gemini.
 *
 * Unlike Whisper and Groq this is not a transcription endpoint - Gemini takes audio
 * as an ordinary input part on a normal generation call, which is why the
 * transcription server has to hand-roll that request rather than go through the AI
 * SDK's transcribe(). The upside is that the same call can label speakers, so
 * diarization survives the move off gpt-4o-transcribe-diarize.
 */
export function usesGeminiTranscription() {
  return transcriptionProvider() === "gemini" && Boolean(geminiApiKey());
}

export function geminiTranscriptionConfig() {
  return {
    apiKey: geminiApiKey(),
    // 3.5 rather than the newest. gemini-3.7-flash returned "this model is currently
    // experiencing high demand" on every attempt when this was wired up, while 3.5
    // transcribed the same audio in 17s - a default that fails under load is worse
    // than one a version behind. Pinned rather than using the gemini-flash-latest
    // alias, because an alias moving underneath a structured-output schema is drift
    // that is very hard to attribute later.
    model: brandedEnv("EHLLO_GEMINI_TRANSCRIPTION_MODEL", "AFTERMEET_GEMINI_TRANSCRIPTION_MODEL") || "gemini-3.5-flash",
  };
}

/** The model instance the transcription server hands audio to. */
export function geminiTranscriptionModel() {
  return geminiClient()(geminiTranscriptionConfig().model);
}

/** EHLLO_TEXT_PROVIDER=gemini routes summaries/extraction/drafts to Gemini. */
export function usesGeminiText() {
  const provider = brandedEnv("EHLLO_TEXT_PROVIDER", "AFTERMEET_TEXT_PROVIDER").toLowerCase();
  return (provider === "gemini" || provider === "google") && Boolean(geminiApiKey());
}

function geminiClient() {
  return createGoogleGenerativeAI({ apiKey: geminiApiKey() });
}

export function groqTranscriptionConfig() {
  return {
    apiKey: groqApiKey(),
    model: brandedEnv("EHLLO_GROQ_MODEL", "AFTERMEET_GROQ_MODEL") || "whisper-large-v3-turbo",
  };
}

/** EHLLO_TEXT_PROVIDER=claude routes summaries/extraction/drafts to Claude. Transcription stays on Whisper. */
export function usesClaudeText() {
  const provider = brandedEnv("EHLLO_TEXT_PROVIDER", "AFTERMEET_TEXT_PROVIDER").toLowerCase();
  return (provider === "claude" || provider === "anthropic") && Boolean(anthropicApiKey());
}

function anthropicClient() {
  return createAnthropic({ apiKey: anthropicApiKey() });
}

/** Claude Opus 5 and later reject non-default temperature - omit it when routed to Claude. */
export function textTemperature(value: number) {
  return usesClaudeText() ? undefined : value;
}

/** Prefer direct OpenAI so transcription/extraction work without AI Gateway billing. */
export function usesDirectOpenAi() {
  return Boolean(openAiApiKey());
}

export async function isAiConfigured() {
  if (usesGeminiText()) return true;
  if (usesDirectOpenAi()) return true;
  return isAiGatewayConfigured();
}

export async function isTranscriptionConfigured() {
  if (usesGeminiTranscription()) return true;
  if (usesGroqTranscription()) return true;
  return isAiConfigured();
}

export async function prepareAiAuth() {
  // Gemini carries its own key, so there is no gateway token to refresh first.
  if (usesGeminiText() || usesGeminiTranscription()) {
    return { configured: true, mode: "gemini_api_key" as const };
  }
  if (usesDirectOpenAi()) {
    return { configured: true, mode: "openai_api_key" as const };
  }
  return refreshAiGatewayAuth();
}

function openAiClient() {
  return createOpenAI({ apiKey: openAiApiKey() });
}

function stripOpenAiPrefix(modelId: string) {
  return modelId.replace(/^openai\//, "").trim();
}

export function transcriptionModel() {
  const configured = brandedEnv("EHLLO_TRANSCRIPTION_MODEL", "AFTERMEET_TRANSCRIPTION_MODEL") || "openai/whisper-1";
  if (usesDirectOpenAi()) {
    return openAiClient().transcription(stripOpenAiPrefix(configured) || "whisper-1");
  }
  return configured;
}

export function languageModel() {
  if (usesGeminiText()) {
    // Pinned, and on 3.5 for the same availability reason as the transcription model.
    const configured = brandedEnv("EHLLO_GEMINI_MODEL", "AFTERMEET_GEMINI_MODEL") || "gemini-3.5-flash";
    return geminiClient()(configured);
  }
  if (usesClaudeText()) {
    const configured = brandedEnv("EHLLO_CLAUDE_MODEL", "AFTERMEET_CLAUDE_MODEL") || "claude-opus-5";
    return anthropicClient()(configured);
  }
  const configured = brandedEnv("EHLLO_EXTRACTION_MODEL", "AFTERMEET_EXTRACTION_MODEL") || "openai/gpt-4.1";
  if (usesDirectOpenAi()) {
    return openAiClient()(stripOpenAiPrefix(configured) || "gpt-4.1");
  }
  return configured;
}
