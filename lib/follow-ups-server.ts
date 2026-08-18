import type { Encounter, EncounterAction, EncounterParticipant } from "./encounters";
import {
  getFollowUpEffectiveState,
  isFollowUpTerminal,
  type FollowUpEffectiveState,
} from "./follow-up-lifecycle.ts";

export type FollowUpItem = {
  encounterId: string;
  actionId: string;
  groupId?: string;
  title: string;
  channel: EncounterAction["channel"];
  dueAt: string;
  status: EncounterAction["status"];
  effectiveState: FollowUpEffectiveState;
  completedAt?: string;
  snoozedUntil?: string;
  dismissedAt?: string;
  cancelledAt?: string;
  statusUpdatedAt?: string;
  owner: EncounterAction["owner"];
  personName: string;
  personEmail: string;
  participantId?: string;
  participants: EncounterParticipant[];
  contactId?: string;
  exchangeId?: string;
  encounterTitle: string;
  startedAt: string;
  contactMethods?: FollowUpContactMethod[];
  eventId?: string;
  /** The linked event's title, if any - populated by the API route (see app/api/follow-ups/route.ts), not here. */
  eventTitle?: string;
};

export type FollowUpContactMethod = {
  id: string;
  type: "email" | "phone" | "linkedin" | "whatsapp" | "instagram" | "x" | "tiktok";
  value: string;
  label: string;
};

/**
 * Includes both the host's own actions (owner "me") and actions assigned to
 * the other party (owner "guest") so the host can track - and confirm - the
 * whole meeting's follow-through in one place, not just their own half.
 * Includes completed actions too (bounded by the 250-encounter query limit
 * upstream) - the client buckets open vs. completed into the Current/Past
 * tabs via filterFollowUpsByScope, so this must return both.
 *
 * Excludes actions belonging to an unreviewed ("draft") encounter. A user can
 * choose follow-ups while transcription is still running, but nothing may
 * become actionable - visible in the queue, reminder-eligible, or sendable -
 * until the encounter has been reviewed and approved. This is the single
 * choke point both the follow-ups API and the reminder cron read through, so
 * gating here is sufficient to keep pending follow-ups pending everywhere.
 */
export function flattenOpenFollowUps(encounters: Encounter[]): FollowUpItem[] {
  const items: FollowUpItem[] = [];
  for (const encounter of encounters) {
    if (encounter.status === "draft") continue;
    for (const action of encounter.actions) {
      if (!action.title.trim()) continue;
      // Proposed actions remain attached to the meeting while its review is
      // pending. They must not appear in the actionable Follow-ups queue.
      if (action.status === "proposed") continue;
      items.push({
        encounterId: encounter.id,
        actionId: action.id,
        groupId: action.groupId,
        title: action.title.trim(),
        channel: action.channel,
        dueAt: action.dueAt || "",
        status: action.status,
        effectiveState: getFollowUpEffectiveState(action),
        completedAt: action.completedAt,
        snoozedUntil: action.snoozedUntil,
        dismissedAt: action.dismissedAt,
        cancelledAt: action.cancelledAt,
        statusUpdatedAt: action.statusUpdatedAt,
        owner: action.owner ?? "me",
        personName: action.assigneeName?.trim() || encounter.personName,
        personEmail: action.assigneeEmail?.trim() || encounter.personEmail,
        participantId: action.participantId,
        participants: encounter.participants,
        contactId: encounter.contactId,
        exchangeId: encounter.exchangeId,
        encounterTitle: encounter.title,
        startedAt: encounter.startedAt,
        eventId: encounter.eventId,
      });
    }
  }
  return items;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeek(date: Date) {
  const copy = startOfDay(date);
  const day = copy.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  copy.setDate(copy.getDate() + daysUntilSunday);
  return copy;
}

export function dueDateBucket(dueAt: string, now = new Date()): "overdue" | "today" | "week" | "future" | "none" {
  if (!dueAt.trim()) return "none";
  const due = startOfDay(new Date(`${dueAt.slice(0, 10)}T12:00:00`));
  if (Number.isNaN(due.getTime())) return "none";
  const today = startOfDay(now);
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  if (due <= endOfWeek(today)) return "week";
  return "future";
}

export function sortFollowUps(items: FollowUpItem[]): FollowUpItem[] {
  const bucketOrder = { overdue: 0, today: 1, week: 2, future: 3, none: 4 } as const;
  return [...items].sort((left, right) => {
    if (isFollowUpTerminal(left.status) && isFollowUpTerminal(right.status)) {
      const leftSettledAt = left.statusUpdatedAt || left.completedAt || left.dismissedAt || left.cancelledAt || left.startedAt;
      const rightSettledAt = right.statusUpdatedAt || right.completedAt || right.dismissedAt || right.cancelledAt || right.startedAt;
      return rightSettledAt.localeCompare(leftSettledAt);
    }
    const leftBucket = bucketOrder[dueDateBucket(left.dueAt)];
    const rightBucket = bucketOrder[dueDateBucket(right.dueAt)];
    if (leftBucket !== rightBucket) return leftBucket - rightBucket;

    if (left.dueAt && right.dueAt && left.dueAt !== right.dueAt) {
      return left.dueAt.localeCompare(right.dueAt);
    }

    return right.startedAt.localeCompare(left.startedAt);
  });
}

export function formatDueLabel(dueAt: string, now = new Date()): string | null {
  if (!dueAt.trim()) return null;
  const bucket = dueDateBucket(dueAt, now);
  const due = startOfDay(new Date(`${dueAt.slice(0, 10)}T12:00:00`));
  const today = startOfDay(now);
  if (bucket === "overdue") {
    const days = Math.max(1, Math.round((today.getTime() - due.getTime()) / 86_400_000));
    return days === 1 ? "Overdue 1d" : `Overdue ${days}d`;
  }
  if (bucket === "today") return "Today";
  if (bucket === "week") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (due.getTime() === tomorrow.getTime()) return "Tomorrow";
    return due.toLocaleDateString(undefined, { weekday: "short" });
  }
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function encountersForConnection(
  encounters: Encounter[],
  input: { connectionId?: string; sourceId?: string; email?: string; exchangeId?: string },
): Encounter[] {
  return encounters.filter((encounter) => encounterMatchesConnection(encounter, input));
}

export function encounterMatchesConnection(
  encounter: Encounter,
  input: { connectionId?: string; sourceId?: string; email?: string; exchangeId?: string },
): boolean {
  const email = input.email?.trim().toLowerCase() || "";
  const exchangeId = input.exchangeId?.trim() || "";
  const sourceId = input.sourceId?.trim() || "";
  const connectionId = input.connectionId?.trim() || "";

  if (connectionId && encounter.contactId === connectionId) return true;
  if (sourceId && encounter.contactId === sourceId) return true;
  if (exchangeId && encounter.exchangeId === exchangeId) return true;
  if (email && encounter.personEmail.trim().toLowerCase() === email) return true;

  return encounter.participants.some((participant) => (
    (sourceId && (participant.id === sourceId || participant.exchangeId === sourceId))
    || (exchangeId && participant.exchangeId === exchangeId)
    || (email && participant.email.trim().toLowerCase() === email)
  ));
}

export function followUpsForConnection(items: FollowUpItem[], input: Parameters<typeof encountersForConnection>[1]) {
  const email = input.email?.trim().toLowerCase() || "";
  const exchangeId = input.exchangeId?.trim() || "";
  const sourceId = input.sourceId?.trim() || "";
  const connectionId = input.connectionId?.trim() || "";

  return items.filter((item) => {
    if (email && item.personEmail.trim().toLowerCase() === email) return true;
    if (sourceId && item.participantId === sourceId) return true;

    const targetParticipant = item.participantId
      ? item.participants.find((participant) => participant.id === item.participantId)
      : undefined;
    if (targetParticipant) {
      if (email && targetParticipant.email.trim().toLowerCase() === email) return true;
      if (exchangeId && targetParticipant.exchangeId === exchangeId) return true;
      if (sourceId && targetParticipant.exchangeId === sourceId) return true;
      return false;
    }

    // Legacy actions did not identify their relationship target. Preserve
    // primary-person matching until those records are repaired on save.
    if (connectionId && item.contactId === connectionId) return true;
    if (sourceId && item.contactId === sourceId) return true;
    if (exchangeId && item.exchangeId === exchangeId) return true;
    return false;
  });
}
