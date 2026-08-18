export const FOLLOW_UP_STATUSES = [
  "proposed",
  "open",
  "snoozed",
  "completed",
  "dismissed",
  "cancelled",
] as const;

export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];
export type FollowUpEffectiveState =
  | "proposed"
  | "open"
  | "scheduled"
  | "due"
  | "overdue"
  | "snoozed"
  | "completed"
  | "dismissed"
  | "cancelled";

export type FollowUpLifecycleFields = {
  status: FollowUpStatus;
  dueAt?: string;
  snoozedUntil?: string;
  completedAt?: string;
  dismissedAt?: string;
  cancelledAt?: string;
  statusUpdatedAt?: string;
};

const STATUS_SET = new Set<string>(FOLLOW_UP_STATUSES);
const TERMINAL_STATUSES = new Set<FollowUpStatus>(["completed", "dismissed", "cancelled"]);

const TRANSITIONS: Record<FollowUpStatus, ReadonlySet<FollowUpStatus>> = {
  proposed: new Set(["open", "dismissed", "cancelled"]),
  open: new Set(["snoozed", "completed", "dismissed", "cancelled"]),
  snoozed: new Set(["open", "completed", "dismissed", "cancelled"]),
  completed: new Set(["open"]),
  dismissed: new Set(["open"]),
  cancelled: new Set(["open"]),
};

export function normalizeFollowUpStatus(value: unknown): FollowUpStatus {
  return typeof value === "string" && STATUS_SET.has(value) ? value as FollowUpStatus : "open";
}

export function isFollowUpTerminal(status: FollowUpStatus) {
  return TERMINAL_STATUSES.has(status);
}

export function canTransitionFollowUp(from: FollowUpStatus, to: FollowUpStatus) {
  return from === to || TRANSITIONS[from].has(to);
}

/**
 * A proposed follow-up only activates once its encounter's review is
 * confirmed (encounterStatus leaves "draft"). That bulk activation happens
 * in the encounter save route, not here - so this route must refuse to
 * touch a still-proposed action while the parent encounter is still a
 * draft, even though "proposed" -> "open" is otherwise a valid transition.
 */
export function isFollowUpReviewGated(encounterStatus: string, actionStatus: FollowUpStatus) {
  return encounterStatus === "draft" && actionStatus === "proposed";
}

export function isFutureSnoozeTarget(snoozedUntil: string | undefined, now = new Date()) {
  const snoozeTime = snoozedUntil ? Date.parse(snoozedUntil) : Number.NaN;
  return !Number.isNaN(snoozeTime) && snoozeTime > now.getTime();
}

export function applyFollowUpTransition<T extends FollowUpLifecycleFields>(
  action: T,
  nextStatus: FollowUpStatus,
  now = new Date().toISOString(),
  snoozedUntil?: string,
): T {
  if (!canTransitionFollowUp(action.status, nextStatus)) {
    throw new Error(`Invalid follow-up transition: ${action.status} -> ${nextStatus}`);
  }

  return {
    ...action,
    status: nextStatus,
    statusUpdatedAt: action.status === nextStatus ? action.statusUpdatedAt : now,
    snoozedUntil: nextStatus === "snoozed" ? snoozedUntil : undefined,
    completedAt: nextStatus === "completed" ? action.completedAt || now : undefined,
    dismissedAt: nextStatus === "dismissed" ? action.dismissedAt || now : undefined,
    cancelledAt: nextStatus === "cancelled" ? action.cancelledAt || now : undefined,
  };
}

export function getFollowUpEffectiveState(
  action: FollowUpLifecycleFields,
  now = new Date(),
): FollowUpEffectiveState {
  if (action.status === "proposed" || isFollowUpTerminal(action.status)) return action.status;

  if (action.status === "snoozed") {
    const wakeAt = action.snoozedUntil ? new Date(action.snoozedUntil) : null;
    if (wakeAt && !Number.isNaN(wakeAt.getTime()) && wakeAt > now) return "snoozed";
  }

  if (!action.dueAt) return "open";
  const dueAt = new Date(action.dueAt);
  if (Number.isNaN(dueAt.getTime())) return "open";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
  if (dueDay < today) return "overdue";
  if (dueDay.getTime() === today.getTime()) return "due";
  return "scheduled";
}

export function isFollowUpReminderEligible(action: FollowUpLifecycleFields, now = new Date()) {
  const effective = getFollowUpEffectiveState(action, now);
  return effective === "open" || effective === "scheduled" || effective === "due" || effective === "overdue";
}
