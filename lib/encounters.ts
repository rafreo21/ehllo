import type { LocalRecordingMetadata } from "./local-recordings";
import { normalizeFollowUpStatus, type FollowUpStatus } from "./follow-up-lifecycle.ts";

export type EncounterAction = {
  id: string;
  title: string;
  channel: "email" | "linkedin" | "call" | "meeting" | "send" | "whatsapp" | "instagram" | "x" | "tiktok" | "other";
  owner: "me" | "guest";
  dueAt: string;
  status: FollowUpStatus;
  snoozedUntil?: string;
  completedAt?: string;
  dismissedAt?: string;
  cancelledAt?: string;
  statusUpdatedAt?: string;
  assigneeName?: string;
  assigneeEmail?: string;
  participantId?: string;
  groupId?: string;
  outboundDraft?: OutboundDraft;
};

export type EncounterParticipant = {
  id: string;
  name: string;
  email: string;
  phone: string;
  linkedIn: string;
  exchangeId?: string;
};

const ACTION_CHANNELS = new Set<EncounterAction["channel"]>([
  "email", "linkedin", "call", "meeting", "send", "whatsapp", "instagram", "x", "tiktok", "other",
]);

function normalizedMatch(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

/**
 * Canonicalizes the action JSON shared by web, iOS, and Android.
 * `owner` describes who must act; `participantId` describes which relationship
 * the action belongs to. They are intentionally independent.
 */
export function normalizeEncounterActions(
  input: unknown,
  participants: EncounterParticipant[],
  fallbackPerson?: { name?: string; email?: string },
): EncounterAction[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim().slice(0, 120) : "";
    const title = typeof record.title === "string" ? record.title.trim().slice(0, 500) : "";
    if (!id || !title) return [];

    const requestedParticipantId = typeof record.participantId === "string"
      ? record.participantId.trim()
      : "";
    const requestedName = normalizedMatch(record.assigneeName);
    const requestedEmail = normalizedMatch(record.assigneeEmail);
    const participant = participants.find((person) => person.id === requestedParticipantId)
      ?? participants.find((person) => requestedEmail && normalizedMatch(person.email) === requestedEmail)
      ?? participants.find((person) => requestedName && normalizedMatch(person.name) === requestedName)
      ?? participants[0];

    const owner: EncounterAction["owner"] = record.owner === "guest" ? "guest" : "me";
    const channel = ACTION_CHANNELS.has(record.channel as EncounterAction["channel"])
      ? record.channel as EncounterAction["channel"]
      : "other";
    const status = normalizeFollowUpStatus(record.status);
    const assigneeName = participant?.name.trim()
      || (typeof record.assigneeName === "string" ? record.assigneeName.trim().slice(0, 160) : "")
      || fallbackPerson?.name?.trim().slice(0, 160)
      || undefined;
    const assigneeEmail = participant?.email.trim()
      || (typeof record.assigneeEmail === "string" ? record.assigneeEmail.trim().slice(0, 320) : "")
      || fallbackPerson?.email?.trim().slice(0, 320)
      || undefined;

    return [{
      id,
      title,
      channel,
      owner,
      dueAt: typeof record.dueAt === "string" ? record.dueAt.trim().slice(0, 40) : "",
      status,
      snoozedUntil: typeof record.snoozedUntil === "string" && record.snoozedUntil.trim()
        ? record.snoozedUntil.trim()
        : undefined,
      completedAt: typeof record.completedAt === "string" && record.completedAt.trim()
        ? record.completedAt.trim()
        : undefined,
      dismissedAt: typeof record.dismissedAt === "string" && record.dismissedAt.trim()
        ? record.dismissedAt.trim()
        : undefined,
      cancelledAt: typeof record.cancelledAt === "string" && record.cancelledAt.trim()
        ? record.cancelledAt.trim()
        : undefined,
      statusUpdatedAt: typeof record.statusUpdatedAt === "string" && record.statusUpdatedAt.trim()
        ? record.statusUpdatedAt.trim()
        : undefined,
      assigneeName,
      assigneeEmail,
      participantId: participant?.id || requestedParticipantId || undefined,
      groupId: typeof record.groupId === "string" && record.groupId.trim()
        ? record.groupId.trim().slice(0, 120)
        : undefined,
      outboundDraft: record.outboundDraft && typeof record.outboundDraft === "object"
        ? record.outboundDraft as OutboundDraft
        : undefined,
    } satisfies EncounterAction];
  });
}

export type OutboundDraft = {
  subject: string;
  body: string;
  status: "proposed" | "approved" | "sent" | "dismissed";
  source: "ai" | "heuristic" | "manual";
  generatedAt: string;
  approvedAt?: string;
  sentAt?: string;
};

export type GuestFollowUp = {
  id?: string;
  participantId?: string;
  guestName?: string;
  guestEmail?: string;
  committedAt: string;
  note?: string;
  channel?: EncounterAction["channel"];
  dueAt?: string;
};

export type Encounter = {
  id: string;
  title: string;
  personName: string;
  personEmail: string;
  contactId?: string;
  exchangeId?: string;
  campaignId?: string;
  /** The event this meeting happened at, if any - see lib/events.ts. Optional context, never required. */
  eventId?: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  consent: {
    confirmed: boolean;
    method: "verbal" | "written";
    confirmedAt: string;
    scriptVersion: "2026-07-26";
  };
  transcript: string;
  privateNotes: string;
  sharedSummary: string;
  recording?: LocalRecordingMetadata;
  actions: EncounterAction[];
  participants: EncounterParticipant[];
  status: "draft" | "reviewed" | "shared" | "archived";
  shareToken: string;
  guestFollowUp?: GuestFollowUp;
  guestFollowUps?: GuestFollowUp[];
  /** Server's last-write timestamp, used for optimistic-concurrency checks on save. Absent for local-only/never-synced encounters. */
  updatedAt?: string;
};

const STORAGE_KEY = "aftermeet-encounters-v1";

export function readEncounters(): Encounter[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as Encounter[];
    return stored.map((encounter) => ({
      ...encounter,
      participants: Array.isArray(encounter.participants) ? encounter.participants : [],
      actions: normalizeEncounterActions(
        encounter.actions,
        Array.isArray(encounter.participants) ? encounter.participants : [],
        { name: encounter.personName, email: encounter.personEmail },
      ),
    }));
  } catch {
    return [];
  }
}

export function writeEncounter(encounter: Encounter) {
  const current = readEncounters();
  const next = [encounter, ...current.filter((item) => item.id !== encounter.id)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function writeEncounters(encounters: Encounter[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(encounters));
}

export function updateEncounter(id: string, update: (encounter: Encounter) => Encounter) {
  const current = readEncounters();
  const next = current.map((item) => (item.id === id ? update(item) : item));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next.find((item) => item.id === id) ?? null;
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

type EncounterRow = {
  id: string;
  title: string;
  person_name: string;
  person_email: string;
  contact_id: string | null;
  exchange_id: string | null;
  campaign_id?: string | null;
  event_id?: string | null;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  consent: Encounter["consent"];
  transcript: string;
  private_notes: string;
  shared_summary: string;
  actions: EncounterAction[];
  participants?: EncounterParticipant[];
  recording_metadata: LocalRecordingMetadata | null;
  status: Encounter["status"];
  share_token: string;
  guest_follow_up: GuestFollowUp | null;
  guest_follow_ups?: GuestFollowUp[];
  updated_at?: string;
};

export function encounterFromApi(row: EncounterRow | Record<string, unknown>): Encounter {
  const record = row as EncounterRow;
  const participants = Array.isArray(record.participants) ? record.participants : [];
  return {
    id: String(record.id),
    title: record.title ?? "",
    personName: record.person_name ?? "",
    personEmail: record.person_email ?? "",
    contactId: record.contact_id ?? undefined,
    exchangeId: record.exchange_id ?? undefined,
    campaignId: typeof record.campaign_id === "string" ? record.campaign_id : undefined,
    eventId: typeof record.event_id === "string" ? record.event_id : undefined,
    startedAt: record.started_at,
    endedAt: record.ended_at,
    durationSeconds: record.duration_seconds ?? 0,
    consent: record.consent,
    transcript: record.transcript ?? "",
    privateNotes: record.private_notes ?? "",
    sharedSummary: record.shared_summary ?? "",
    recording: record.recording_metadata ?? undefined,
    actions: normalizeEncounterActions(record.actions, participants, {
      name: record.person_name,
      email: record.person_email,
    }),
    participants,
    status: record.status ?? "draft",
    shareToken: record.share_token,
    guestFollowUp: record.guest_follow_up ?? undefined,
    guestFollowUps: Array.isArray(record.guest_follow_ups) ? record.guest_follow_ups : [],
    updatedAt: typeof record.updated_at === "string" ? record.updated_at : undefined,
  };
}

export function encounterFromSharedPayload(payload: Record<string, unknown>): Encounter | null {
  if (!payload || typeof payload.id !== "string") return null;
  const participants = Array.isArray(payload.participants)
    ? payload.participants as EncounterParticipant[]
    : [];
  return {
    id: payload.id,
    title: String(payload.title ?? ""),
    personName: String(payload.personName ?? ""),
    personEmail: String(payload.personEmail ?? ""),
    contactId: typeof payload.contactId === "string" ? payload.contactId : undefined,
    exchangeId: typeof payload.exchangeId === "string" ? payload.exchangeId : undefined,
    campaignId: typeof payload.campaignId === "string" ? payload.campaignId : undefined,
    startedAt: String(payload.startedAt ?? new Date().toISOString()),
    endedAt: String(payload.endedAt ?? new Date().toISOString()),
    durationSeconds: typeof payload.durationSeconds === "number" ? payload.durationSeconds : 0,
    consent: payload.consent as Encounter["consent"],
    transcript: String(payload.transcript ?? ""),
    privateNotes: String(payload.privateNotes ?? ""),
    sharedSummary: String(payload.sharedSummary ?? ""),
    recording: payload.recording && typeof payload.recording === "object"
      ? {
          id: String(payload.id),
          durationSeconds: typeof (payload.recording as Record<string, unknown>).durationSeconds === "number"
            ? (payload.recording as Record<string, unknown>).durationSeconds as number
            : 0,
          fileSize: 0,
          mimeType: String((payload.recording as Record<string, unknown>).mimeType ?? "audio/mp4"),
          source: "recorded",
          retention: "never",
          expiresAt: null,
          createdAt: String(payload.startedAt ?? new Date().toISOString()),
          sharedAudioUrl: String((payload.recording as Record<string, unknown>).sharedAudioUrl ?? ""),
          cloudExpiresAt: typeof (payload.recording as Record<string, unknown>).cloudExpiresAt === "string"
            ? (payload.recording as Record<string, unknown>).cloudExpiresAt as string
            : null,
        }
      : undefined,
    actions: normalizeEncounterActions(payload.actions, participants, {
      name: String(payload.personName ?? ""),
      email: String(payload.personEmail ?? ""),
    }),
    participants,
    status: "shared",
    shareToken: String(payload.shareToken ?? ""),
    guestFollowUp: payload.guestFollowUp && typeof payload.guestFollowUp === "object"
      ? payload.guestFollowUp as GuestFollowUp
      : undefined,
    guestFollowUps: Array.isArray(payload.guestFollowUps)
      ? payload.guestFollowUps as GuestFollowUp[]
      : [],
  };
}

export function encounterToApiBody(encounter: Encounter) {
  return {
    id: encounter.id,
    title: encounter.title,
    personName: encounter.personName,
    personEmail: encounter.personEmail,
    contactId: encounter.contactId ?? null,
    exchangeId: encounter.exchangeId ?? null,
    campaignId: encounter.campaignId ?? null,
    // No `?? null` here deliberately: an unset eventId (undefined) must be
    // dropped by JSON.stringify so the save route treats it as "the client
    // has no opinion" and preserves whatever the server already inferred,
    // rather than being sent as an explicit null that would clear it. An
    // explicit clear (the correction UI's "No event") sets eventId to "",
    // which survives serialization and does clear it server-side.
    eventId: encounter.eventId,
    startedAt: encounter.startedAt,
    endedAt: encounter.endedAt,
    durationSeconds: encounter.durationSeconds,
    consent: encounter.consent,
    transcript: encounter.transcript,
    privateNotes: encounter.privateNotes,
    sharedSummary: encounter.sharedSummary,
    actions: encounter.actions,
    participants: encounter.participants,
    recording: encounter.recording,
    status: encounter.status,
    shareToken: encounter.shareToken,
  };
}
