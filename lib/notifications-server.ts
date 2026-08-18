import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Every notification type, in the order they are shown in preferences.
 *
 * The single source. This existed as a hand-kept literal inside
 * app/api/settings/notifications, and it was never updated as types were added -
 * so saving preferences rebuilt the object from the original four and silently
 * dropped connection_added, keep_in_touch and contact_request. Turning those on
 * appeared to work and then reverted the moment the screen reloaded.
 *
 * Deriving the type from this array means adding a value here is the only step:
 * a new type cannot be half-added again.
 */
export const NOTIFICATION_TYPES = [
  "review_ready",
  "follow_up_due",
  "follow_up_overdue",
  "shared_meeting_update",
  "connection_added",
  "keep_in_touch",
  "contact_request",
  "follow_up_completed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  encounterId: string | null;
  actionId: string;
  readAt: string | null;
  createdAt: string;
};

const POSTGRES_UNIQUE_VIOLATION = "23505";

/**
 * Inserts a notification, relying on the (user_id, dedupe_key) unique
 * constraint to make creation at-most-once per event. Works with either the
 * per-request RLS-scoped client (self-triggered events) or the service-role
 * client (cron and guest-triggered events) - both simply insert a row.
 */
export async function createNotification(
  supabase: SupabaseClient,
  input: {
    userId: string;
    workspaceId: string;
    type: NotificationType;
    title: string;
    body?: string;
    encounterId?: string;
    actionId?: string;
    dedupeKey: string;
  },
): Promise<boolean> {
  const { error } = await supabase.from("notifications").insert({
    user_id: input.userId,
    workspace_id: input.workspaceId,
    type: input.type,
    title: input.title.slice(0, 200),
    body: (input.body ?? "").slice(0, 500),
    encounter_id: input.encounterId ?? null,
    action_id: (input.actionId ?? "").slice(0, 200),
    dedupe_key: input.dedupeKey.slice(0, 200),
  });

  if (!error) return true;
  if (error.code === POSTGRES_UNIQUE_VIOLATION) return false;
  throw error;
}

/**
 * A missing key means the type has never been explicitly disabled - every
 * notification type defaults to enabled so preferences never need a
 * migration when a new type is added.
 */
export function notificationTypeEnabled(
  preferences: unknown,
  type: NotificationType,
): boolean {
  if (!preferences || typeof preferences !== "object") return true;
  const value = (preferences as Record<string, unknown>)[type];
  return value !== false;
}

export function mapNotificationRow(row: Record<string, unknown>): NotificationRow {
  return {
    id: String(row.id ?? ""),
    type: row.type as NotificationType,
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    encounterId: typeof row.encounter_id === "string" ? row.encounter_id : null,
    actionId: String(row.action_id ?? ""),
    readAt: typeof row.read_at === "string" ? row.read_at : null,
    createdAt: String(row.created_at ?? ""),
  };
}
