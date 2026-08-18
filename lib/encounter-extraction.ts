import type { Encounter } from "./encounters";
import {
  buildFollowUp,
  buildMeetingTitle,
  buildPrivateNotes,
  buildSharedSummary,
  detectPersonName,
  extractOtherPersonInsights,
  extractOwnerContribution,
  extractRole,
  extractTopics,
  inferFollowUpType,
  segmentSpeechTranscript,
} from "./meeting-context-heuristic.ts";
import { normalizeTranscriptForExtraction } from "./transcript-cleanup.ts";

export type EncounterExtractionDraft = {
  title: string;
  personName: string;
  sharedSummary: string;
  privateNotes: string;
  followUp: string;
  followUpType: Encounter["actions"][number]["channel"];
  commitments?: EncounterExtractionCommitment[];
  uncertainFields?: string[];
};

export type EncounterExtractionCommitment = {
  title: string;
  owner: "me" | "guest";
  ownerName: string;
  channel: Encounter["actions"][number]["channel"];
  dueAt: string;
};

export type ExtractionOwnerContext = {
  ownerNames: string[];
  ownerEmail?: string;
  recentMeetings?: Array<{
    personName: string;
    privateNotesSample?: string;
    sharedSummarySample?: string;
  }>;
};

/** The event this encounter was passively attached to (see resolveCurrentEvent), if any - used only as an optional hint for the summary/follow-up, never required. */
export type ExtractionEventContext = {
  title: string;
  location?: string;
};

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function normalizeExtractionCommitments(
  commitments: EncounterExtractionCommitment[],
  ownerContext?: ExtractionOwnerContext,
  fallbackGuestName = "",
): EncounterExtractionCommitment[] {
  const ownerNames = new Set(
    (ownerContext?.ownerNames ?? [])
      .map((name) => name.trim().toLocaleLowerCase())
      .filter(Boolean),
  );
  const seen = new Set<string>();

  return commitments.flatMap((commitment) => {
    const title = commitment.title.trim();
    if (!title) return [];

    const suppliedOwnerName = commitment.ownerName.trim();
    const suppliedOwnerIsMe = suppliedOwnerName.toLocaleLowerCase() === "me"
      || ownerNames.has(suppliedOwnerName.toLocaleLowerCase());
    const owner = suppliedOwnerIsMe ? "me" : commitment.owner;
    const ownerName = owner === "me"
      ? (ownerContext?.ownerNames[0]?.trim() || "Me")
      : (suppliedOwnerName || fallbackGuestName.trim() || "Guest");
    const dueAt = isValidIsoDate(commitment.dueAt.trim()) ? commitment.dueAt.trim() : "";
    const key = [title, owner, ownerName, commitment.channel]
      .map((value) => value.toLocaleLowerCase())
      .join("|");
    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      title,
      owner,
      ownerName,
      channel: commitment.channel,
      dueAt,
    }];
  });
}

export function buildHeuristicDraft(
  transcript: string,
  personName: string,
  ownerContext?: ExtractionOwnerContext,
): EncounterExtractionDraft | null {
  const clean = normalizeTranscriptForExtraction(transcript);
  if (clean.length < 12) return null;

  const ownerNames = ownerContext?.ownerNames ?? [];
  const segments = segmentSpeechTranscript(clean);
  const person = detectPersonName(clean, personName, ownerNames);
  const topics = extractTopics(clean);
  const role = extractRole(clean, person);
  const ownerContribution = extractOwnerContribution(clean);
  const otherPersonInsights = extractOtherPersonInsights({
    transcript: clean,
    personName: person,
    role,
    segments,
    ownerNames,
  });
  const sharedSummary = buildSharedSummary({
    personName: person,
    topics,
    role,
    ownerContribution,
    transcript: clean,
    ownerNames,
  });
  const privateNotes = buildPrivateNotes({
    personName: person,
    role,
    otherPersonInsights,
    topics,
  });
  const followUp = buildFollowUp({ topics, transcript: clean, ownerContribution, personName: person });

  return {
    title: buildMeetingTitle({ personName: person, topics }),
    personName: person,
    sharedSummary,
    privateNotes,
    followUp,
    followUpType: inferFollowUpType(`${followUp} ${clean}`),
    commitments: followUp ? [{
      title: followUp,
      owner: "me",
      ownerName: ownerNames[0] || "Me",
      channel: inferFollowUpType(`${followUp} ${clean}`),
      dueAt: "",
    }] : [],
  };
}

export function applyExtractionDraft(
  current: {
    title: string;
    personName: string;
    privateNotes: string;
    sharedSummary: string;
    followUp: string;
    followUpType: Encounter["actions"][number]["channel"];
  },
  draft: EncounterExtractionDraft,
  options?: { replace?: boolean },
) {
  if (options?.replace) {
    return {
      ...current,
      title: draft.title,
      personName: draft.personName,
      privateNotes: draft.privateNotes,
      sharedSummary: draft.sharedSummary,
      followUp: draft.followUp,
      followUpType: draft.followUpType,
    };
  }

  return {
    ...current,
    title: current.title || draft.title,
    personName: current.personName || draft.personName,
    privateNotes: current.privateNotes || draft.privateNotes,
    sharedSummary: current.sharedSummary || draft.sharedSummary,
    followUp: current.followUp || draft.followUp,
    followUpType: current.followUp ? current.followUpType : draft.followUpType,
  };
}

export const EXTRACTION_DRAFT_NOTE = {
  ai: "AI draft from your transcript. Check names and facts before saving.",
  heuristic: "Suggested draft from your transcript. Check names and facts before saving.",
  aiNotConfigured: "Draft generated from your transcript. Check names and facts before saving. For richer AI summaries, run vercel link and vercel env pull.",
  aiFallback: "AI summary unavailable. Using a structured draft from your transcript. Check names and facts before saving.",
} as const;
