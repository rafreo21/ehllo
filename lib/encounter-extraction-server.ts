import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";

import {
  buildHeuristicDraft,
  normalizeExtractionCommitments,
  type EncounterExtractionDraft,
  type ExtractionEventContext,
  type ExtractionOwnerContext,
} from "./encounter-extraction";
import { isAiConfigured, languageModel, prepareAiAuth, textTemperature } from "./ai-provider";
import { normalizeTranscriptForExtraction } from "./transcript-cleanup";

const extractionSchema = z.object({
  title: z.string().describe("Short meeting title, max 120 characters. For group meetings, describe the meeting not one person."),
  personName: z.string().describe("Primary attendee name if one person, or a short group label like 'Alex, Jordan, and Sam'"),
  sharedSummary: z.string().describe("3-6 intelligent sentences summarizing what was discussed, decided, and who owns what next. Safe to share with everyone in the meeting."),
  privateNotes: z.string().describe("Leave empty."),
  followUp: z.string().describe("One concrete next action sentence, or empty if none"),
  followUpType: z.enum(["email", "linkedin", "call", "meeting", "send", "whatsapp", "instagram", "x", "tiktok", "other"]),
  commitments: z.array(z.object({
    title: z.string().describe("A concrete action phrased as something that can be completed"),
    owner: z.enum(["me", "guest"]).describe("me when the recording owner owns it; guest when an attendee owns it"),
    ownerName: z.string().describe("The named owner, or Me when the recording owner owns it"),
    channel: z.enum(["email", "linkedin", "call", "meeting", "send", "whatsapp", "instagram", "x", "tiktok", "other"]),
    dueAt: z.string().describe("Explicit due date as YYYY-MM-DD, or empty when no date was agreed"),
  })).describe("Every explicit promise or next action in the conversation. Do not invent actions."),
  uncertainFields: z.array(z.string()).describe("Field names where the transcript is ambiguous"),
});

function formatOwnerContext(context?: ExtractionOwnerContext) {
  if (!context) return "Recording owner: unknown";

  const lines = [
    `Recording owner (me): ${context.ownerNames.join(" / ") || "unknown"}`,
    context.ownerEmail ? `Owner email: ${context.ownerEmail}` : "",
  ].filter(Boolean);

  if (context.recentMeetings?.length) {
    lines.push("", "Recent meetings by this owner (match tone and bullet style, do not copy facts):");
    context.recentMeetings.forEach((meeting, index) => {
      lines.push(
        `${index + 1}. With ${meeting.personName || "someone"}:`,
        meeting.sharedSummarySample ? `   Shared summary sample: ${meeting.sharedSummarySample}` : "",
        meeting.privateNotesSample ? `   Private notes sample: ${meeting.privateNotesSample}` : "",
      );
    });
  }

  return lines.filter(Boolean).join("\n");
}

function buildExtractionSystemPrompt(context?: ExtractionOwnerContext) {
  const ownerLabel = context?.ownerNames?.[0] ?? "the recording owner";

  return [
    "You are AfterMeet's meeting intelligence engine.",
    "The transcript is from a live conversation recorded by the owner (me). When speaker labels are present, preserve their attribution and use the confirmed attendee list to resolve identities. When labels are absent, infer who said what from introductions, names, and first-person cues.",
    `Treat I/me/my as ${ownerLabel} unless the transcript clearly indicates otherwise.`,
    "",
    "The owner already captured attendees separately. Focus on a strong meeting title and an intelligent share summary.",
    "",
    "MEETING TITLE:",
    "- Short, specific, and useful in a meeting list.",
    "- For group meetings, name the meeting topic or group, not just one attendee.",
    "",
    "SHARE SUMMARY (the main output):",
    "- Write a clear, shareable recap: what was discussed, what was decided, what is blocked, and who owns what next.",
    "- Lead with the most important outcome, not chronological play-by-play.",
    "- Attribute commitments clearly when multiple people are involved.",
    "- Use we for joint decisions. Name people when they took ownership.",
    "- 3-6 complete sentences. Write like a sharp human assistant, not a transcript dump.",
    "- Do not repeat the meeting title verbatim in the first sentence.",
    "- Safe to send to everyone who was in the room.",
    "",
    "GROUP MEETINGS:",
    "- When multiple attendees are provided, reflect the group dynamic in title and summary.",
    "- Do not collapse a multi-person meeting into a 1:1 summary.",
    "",
    "PERSON NAME FIELD:",
    "- Return a short attendee label for legacy storage.",
    "- Prefer the confirmed attendee list when provided; otherwise infer from the transcript.",
    "- Never use the recording owner as personName.",
    "",
    "PRIVATE NOTES:",
    "- Always return an empty string.",
    "",
    "COMMITMENTS:",
    "- Extract every explicit promise, request accepted, or agreed next action.",
    "- Keep separate commitments separate; never merge unrelated actions.",
    "- Set owner to me for the recording owner and guest for an attendee.",
    "- Use a named owner when supported by the transcript or confirmed speaker labels.",
    "- Only add a due date when one was explicitly agreed. Otherwise return an empty dueAt.",
    "- The legacy followUp and followUpType fields should mirror the most important owner action, or be empty when none exists.",
    "",
    "TRANSCRIPT QUALITY:",
    "- Input is raw speech-to-text: missing punctuation, false starts, homophones, and repeated fragments are common.",
    "- Reconstruct intended meaning before writing outputs. Never copy gibberish verbatim.",
    "",
    "QUALITY:",
    "- Ignore filler, repeated words, and speech-to-text errors.",
    "- Never invent contact details, dates, amounts, or commitments not supported by the transcript.",
    "- Mark uncertainFields when names, dates, amounts, or commitments are ambiguous.",
    "- Match the owner's note style from recent meetings when examples are provided.",
  ].join("\n");
}

function buildExtractionPrompt(
  normalizedTranscript: string,
  personName: string,
  context?: ExtractionOwnerContext,
  personHints?: {
    personEmail?: string;
    personPhone?: string;
    people?: Array<{ name: string; email?: string; phone?: string }>;
  },
  eventContext?: ExtractionEventContext,
) {
  const attendeeLines = personHints?.people?.length
    ? personHints.people.map((person, index) => {
        const details = [person.email, person.phone].filter(Boolean).join(" · ");
        return `${index + 1}. ${person.name}${details ? ` (${details})` : ""}`;
      })
    : [];

  const hintLines = [
    attendeeLines.length ? `Confirmed attendees:\n${attendeeLines.join("\n")}` : `Attendee hint: ${personName || "unknown. Detect from transcript"}`,
    personHints?.personEmail ? `Primary email hint: ${personHints.personEmail}` : "",
    personHints?.personPhone ? `Primary phone hint: ${personHints.personPhone}` : "",
    eventContext?.title
      ? `Event this was captured at: ${eventContext.title}${eventContext.location ? ` (${eventContext.location})` : ""}. Mention it naturally in the summary or follow-up only if it adds real value — do not force it into every sentence, and never invent event details beyond what's given here.`
      : "",
  ].filter(Boolean);

  return [
    formatOwnerContext(context),
    "",
    ...hintLines,
    "",
    "Transcript:",
    normalizedTranscript,
  ].join("\n");
}

export async function isAiExtractionConfigured() {
  return isAiConfigured();
}

export async function extractEncounterDraft(
  transcript: string,
  personName: string,
  ownerContext?: ExtractionOwnerContext,
  personHints?: {
    personEmail?: string;
    personPhone?: string;
    people?: Array<{ name: string; email?: string; phone?: string }>;
  },
  eventContext?: ExtractionEventContext,
): Promise<{
  draft: EncounterExtractionDraft;
  source: "ai" | "heuristic";
  uncertainFields: string[];
  fallback?: boolean;
  unavailable?: string;
}> {
  const normalizedTranscript = normalizeTranscriptForExtraction(transcript);
  const heuristic = buildHeuristicDraft(normalizedTranscript, personName, ownerContext);
  if (!heuristic) {
    throw new Error("Transcript is too short to extract meeting context.");
  }

  if (!(await isAiExtractionConfigured())) {
    return {
      draft: heuristic,
      source: "heuristic",
      uncertainFields: [],
      unavailable: "ai_not_configured",
    };
  }

  await prepareAiAuth();

  try {
    const result = await generateText({
      model: languageModel(),
      output: Output.object({ schema: extractionSchema }),
      system: buildExtractionSystemPrompt(ownerContext),
      prompt: buildExtractionPrompt(normalizedTranscript, personName, ownerContext, personHints, eventContext),
      temperature: textTemperature(0.2),
    });

    const output = result.output;
    const ownerNames = new Set((ownerContext?.ownerNames ?? []).map((name) => name.toLowerCase()));
    let resolvedPersonName = output.personName.trim() || personName || heuristic.personName;
    if (ownerNames.has(resolvedPersonName.toLowerCase())) {
      resolvedPersonName = heuristic.personName || personName;
    }

    return {
      draft: {
        title: output.title.trim().slice(0, 160) || heuristic.title,
        personName: resolvedPersonName,
        sharedSummary: output.sharedSummary.trim() || heuristic.sharedSummary,
        privateNotes: "",
        followUp: output.followUp.trim(),
        followUpType: output.followUpType,
        commitments: normalizeExtractionCommitments(
          output.commitments,
          ownerContext,
          resolvedPersonName,
        ),
      },
      source: "ai",
      uncertainFields: output.uncertainFields ?? [],
    };
  } catch {
    return {
      draft: heuristic,
      source: "heuristic",
      uncertainFields: [],
      fallback: true,
    };
  }
}
