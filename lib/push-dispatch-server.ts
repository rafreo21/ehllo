import type { SupabaseClient } from "@supabase/supabase-js";

import type { NotificationType } from "./notifications-server";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const MAX_MESSAGES_PER_REQUEST = 100;

type PushToken = { id: string; expo_push_token: string };

type ExpoTicket = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

/**
 * Every notification type currently deep-links to the same review screen -
 * matching notificationDeepLink() in mobile/src/features/notifications/notification-center-api.ts,
 * which is what the in-app centre already uses for the same event types.
 */
function routeFor(encounterId?: string): string | null {
  return encounterId ? `/capture/${encounterId}` : null;
}

/**
 * Sends a remote push to every active device the user has registered, and
 * best-effort records delivery status per token. Never throws - a missed
 * push must never fail the database notification that already exists, or
 * whatever save/save-adjacent request triggered it.
 */
export async function dispatchPushForUser(
  supabase: SupabaseClient,
  input: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    encounterId?: string;
    actionId?: string;
  },
): Promise<void> {
  try {
    const { data } = await supabase
      .from("push_tokens")
      .select("id, expo_push_token")
      .eq("user_id", input.userId)
      .is("disabled_at", null);
    const tokens = (data ?? []) as PushToken[];
    if (!tokens.length) return;

    const route = routeFor(input.encounterId);
    const messages = tokens.map((token) => ({
      to: token.expo_push_token,
      title: input.title,
      body: input.body || "",
      sound: "default" as const,
      data: {
        type: input.type,
        route,
        encounterId: input.encounterId ?? null,
        actionId: input.actionId ?? "",
      },
    }));

    for (let i = 0; i < messages.length; i += MAX_MESSAGES_PER_REQUEST) {
      await sendChunk(
        supabase,
        messages.slice(i, i + MAX_MESSAGES_PER_REQUEST),
        tokens.slice(i, i + MAX_MESSAGES_PER_REQUEST),
      );
    }
  } catch {
    // Best-effort - the notification row already exists regardless.
  }
}

async function sendChunk(supabase: SupabaseClient, messages: unknown[], tokens: PushToken[]) {
  const now = new Date().toISOString();
  let tickets: ExpoTicket[];

  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    const payload = await response.json() as { data?: ExpoTicket[] };
    tickets = payload.data ?? [];
  } catch (caught) {
    await supabase.from("push_tokens").update({
      last_delivery_status: "error",
      last_delivery_error: (caught instanceof Error ? caught.message : "Network error reaching Expo.").slice(0, 200),
      last_delivery_at: now,
    }).in("id", tokens.map((token) => token.id));
    return;
  }

  await Promise.all(tokens.map(async (token, index) => {
    const ticket = tickets[index];
    if (!ticket) return;

    if (ticket.status === "ok") {
      await supabase.from("push_tokens").update({
        last_delivery_status: "ok",
        last_delivery_error: null,
        last_delivery_at: now,
        last_seen_at: now,
      }).eq("id", token.id);
      return;
    }

    // DeviceNotRegistered means Expo will never deliver to this token again -
    // any other install, uninstall, or re-registration issues a new one.
    const errorCode = ticket.details?.error;
    const deactivate = errorCode === "DeviceNotRegistered";
    await supabase.from("push_tokens").update({
      last_delivery_status: "error",
      last_delivery_error: (ticket.message || errorCode || "Unknown Expo delivery error.").slice(0, 200),
      last_delivery_at: now,
      ...(deactivate ? { disabled_at: now } : {}),
    }).eq("id", token.id);
  }));
}
