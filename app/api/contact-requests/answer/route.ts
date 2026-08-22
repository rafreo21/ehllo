import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";
import { createNotification, notificationTypeEnabled } from "../../../../lib/notifications-server";
import { dispatchPushForUser } from "../../../../lib/push-dispatch-server";
import { createServiceSupabaseClient } from "../../../../lib/supabase/service";

/**
 * Answers a request somebody made for one of your contact details.
 *
 * Requests could be made, recorded and notified, and then nothing: the person asked
 * had no way to say yes or no, so the row sat pending forever and the requester
 * could not tell "hasn't seen it" from "would rather not".
 *
 * The row lives in the requester's workspace, so this goes through a
 * security-definer function matched on the caller's own verified address - it can
 * only ever answer a request actually addressed to them.
 */
/**
 * PostgREST's "no such function". The migration adding answer_contact_requests lands on
 * the same push as this code, and the migration workflow and the web deploy are not
 * ordered against each other - so for a few seconds the function may not exist yet.
 * Falling back beats failing an answer somebody is waiting on.
 */
function isMissingFunction(error: { code?: string; message?: string }) {
  const message = (error.message ?? "").toLowerCase();
  return error.code === "PGRST202"
    || message.includes("could not find the function")
    || message.includes("does not exist");
}

type AnswerAttempt = { data: unknown; error: { code?: string; message: string } | null };

/**
 * Answers every ask in the group. One statement where the database supports it, because
 * a group can hold hundreds of asks and one round trip each would time out; the loop is
 * only the deploy-window fallback.
 */
async function answerGroup(
  supabase: Awaited<ReturnType<typeof createApiSupabaseClient>>,
  ids: string[],
  share: boolean,
  value: string,
): Promise<AnswerAttempt> {
  const answer = { p_share: share, p_value: share ? value : null };

  const plural = await supabase.rpc("answer_contact_requests", { p_ids: ids, ...answer });
  if (!plural.error || !isMissingFunction(plural.error)) return plural as AnswerAttempt;

  const first = await supabase.rpc("answer_contact_request", { p_id: ids[0], ...answer });
  if (first.error) return first as AnswerAttempt;
  // The rest cleared after the first, so the notification below still fires once.
  // Failures are swallowed deliberately: the answer already landed, and a stale
  // duplicate is better than an answer that appears not to have worked.
  for (const extra of ids.slice(1)) {
    await supabase.rpc("answer_contact_request", { p_id: extra, ...answer })
      .then(() => undefined, () => undefined);
  }
  return first as AnswerAttempt;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    id?: string;
    ids?: string[];
    share?: boolean;
    value?: string;
  } | null;

  // ids, plural, so one answer clears every ask from the same person for the same
  // detail. Somebody who asked fifteen times should not have to be answered fifteen
  // times, and the fourteen left behind would sit pending forever. `id` stays accepted
  // for the app build that predates this.
  const ids = [
    ...(Array.isArray(body?.ids) ? body.ids : []),
    ...(typeof body?.id === "string" ? [body.id] : []),
  ].map((value) => String(value).trim()).filter(Boolean);
  const id = ids[0] ?? "";
  const share = body?.share === true;
  const value = typeof body?.value === "string" ? body.value.trim() : "";
  if (!id) return NextResponse.json({ error: "A request id is required." }, { status: 400 });
  if (share && !value) {
    return NextResponse.json({ error: "Add the detail you want to share." }, { status: 400 });
  }

  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") return NextResponse.json({ ok: true, preview: true });

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await answerGroup(supabase, ids, share, value);

  if (error) {
    const message = error.message.toLowerCase();
    const notFound = message.includes("request_not_found");
    console.error("[contact-requests] could not answer", { code: error.code, message: error.message });
    return NextResponse.json(
      { error: notFound ? "This request is no longer available." : "We couldn’t answer this request." },
      { status: notFound ? 404 : 500 },
    );
  }

  // Telling the requester is the whole point - they are the one waiting, and nothing
  // in their own workspace changed that they could notice. A decline is worth telling
  // them too: silence is what made this feel broken. The value itself never travels
  // in a decline.
  const result = (data ?? {}) as {
    shared?: boolean;
    value?: string | null;
    fieldType?: string;
    requesterUserId?: string;
    requesterWorkspaceId?: string;
    answeredByName?: string;
  };
  try {
    const service = createServiceSupabaseClient();
    if (service && result.requesterUserId && result.requesterWorkspaceId) {
      const { data: requester } = await service
        .from("users")
        .select("notification_preferences")
        .eq("id", result.requesterUserId)
        .maybeSingle();

      if (notificationTypeEnabled(requester?.notification_preferences, "contact_request")) {
        const who = result.answeredByName || "Someone";
        const field = (result.fieldType || "detail").replace(/_/g, " ");
        const title = result.shared
          ? `${who} shared their ${field}`
          : `${who} didn’t share their ${field}`;
        const noticeBody = result.shared
          ? String(result.value ?? "")
          : "They chose not to share it this time.";

        const created = await createNotification(service, {
          userId: result.requesterUserId,
          workspaceId: result.requesterWorkspaceId,
          type: "contact_request",
          title,
          body: noticeBody,
          dedupeKey: `contact_request_answered:${id}`,
        });
        if (created) {
          await dispatchPushForUser(service, {
            userId: result.requesterUserId,
            type: "contact_request",
            title,
            body: noticeBody,
          });
        }
      }
    }
  } catch (caught) {
    console.error("[contact-requests] answered, but notifying the requester threw", {
      id,
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }

  return NextResponse.json({ ok: true, shared: result.shared === true }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
