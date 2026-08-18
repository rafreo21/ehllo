import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
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
  if (usesDirectOpenAi()) return true;
  return isAiGatewayConfigured();
}

export async function isTranscriptionConfigured() {
  if (usesGroqTranscription()) return true;
  return isAiConfigured();
}

export async function prepareAiAuth() {
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
