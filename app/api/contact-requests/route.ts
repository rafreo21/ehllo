import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../lib/auth/api-request";
import { createNotification, notificationTypeEnabled } from "../../../lib/notifications-server";
import { dispatchPushForUser } from "../../../lib/push-dispatch-server";
import {
  groupContactRequests,
  MAX_REQUEST_GROUPS,
  type ContactRequestRow,
} from "../../../lib/contact-request-groups";
import { createServiceSupabaseClient } from "../../../lib/supabase/service";

const allowedFieldPattern = /^[a-z_]+$/;

function isAllowedFieldType(fieldType: string) {
  return allowedFieldPattern.test(fieldType) && fieldType.length <= 40;
}

/**
 * Display names for the people asking, by user id.
 *
 * Uses the service client because a requester's card lives in their workspace and the
 * caller cannot read it. Scoped to ids that already appear in the caller's own pending
 * requests, so this reveals nothing they were not already entitled to see - and being
 * asked for your phone number by "someone" is not something anyone should have to act on.
 */
async function resolveRequesterNames(workspaceIds: Array<string | null>): Promise<Map<string, string>> {
  const wanted = [...new Set(workspaceIds.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (!wanted.length) return names;

  const service = createServiceSupabaseClient();
  if (!service) return names;

  // Keyed on workspace, because that is what a request row carries and what a card
  // belongs to - cards have no created_by_user_id, and an earlier version of this
  // selected one, which would have returned no names at all without erroring.
  const { data } = await service
    .from("cards")
    .select("workspace_id, full_name, is_primary")
    .in("workspace_id", wanted)
    .order("is_primary", { ascending: false });

  for (const row of (data ?? []) as Array<{ workspace_id: string; full_name: string | null }>) {
    const name = row.full_name?.trim();
    // Primary first, so the first name seen for a workspace is the one they lead with.
    if (name && !names.has(row.workspace_id)) names.set(row.workspace_id, name);
  }
  return names;
}

export async function GET(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ requests: [], preview: true });
  }

  const url = new URL(request.url);
  const targetEmail = url.searchParams.get("targetEmail")?.trim().toLowerCase() || user.email?.trim().toLowerCase() || "";
  if (!targetEmail) {
    return NextResponse.json({ requests: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createApiSupabaseClient(request);
  // High ceiling rather than a display limit. The old limit of 20 was applied to rows,
  // so one person asking fifteen times for the same detail consumed fifteen of them and
  // pushed other people's requests out of sight entirely - and being out of sight means
  // out of reach, because an unanswerable request stays pending forever and the person
  // who asked waits without explanation. Grouping is what the limit should have counted.
  const { data, error } = await supabase
    .from("contact_field_requests")
    .select("id, field_type, channel, follow_up_title, status, created_at, requester_user_id, workspace_id")
    .eq("target_email", targetEmail)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: "Could not load contact requests." }, { status: 500 });
  }

  const rows = (data ?? []) as ContactRequestRow[];

  // One entry per person per detail. Grouping, the cap and the "answer once, clear them
  // all" contract all live in lib/contact-request-groups.ts, which is tested.
  const allGroups = groupContactRequests(rows);
  const groups = allGroups.slice(0, MAX_REQUEST_GROUPS);

  // Who is asking, resolved with elevated access on purpose and narrowly: only for the
  // requester ids already present in this person's own pending requests. Someone asking
  // you for your phone number should not be anonymous to you.
  const names = await resolveRequesterNames(groups.map((group) => group.workspaceId));

  return NextResponse.json({
    // Kept so an app build that predates grouping keeps working. Both shapes describe
    // the same rows; new clients should read groups.
    requests: rows.slice(0, MAX_REQUEST_GROUPS),
    // Spelled out rather than spread, so requesterUserId and the requester's own
    // workspace id stay on the server. They are only here to look a name up with.
    // "Someone" rather than an empty string: the clients render this straight into a
    // sentence, and one of them would have shown " asked for your phone number".
    groups: groups.map((group) => ({
      key: group.key,
      requesterName: (group.workspaceId ? names.get(group.workspaceId) : "")?.trim() || "Someone",
      fieldType: group.fieldType,
      ids: group.ids,
      count: group.count,
      latestAt: group.latestAt,
      followUpTitle: group.followUpTitle,
    })),
    groupsTotal: allGroups.length,
    groupsTruncated: Math.max(0, allGroups.length - groups.length),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    targetEmail?: string;
    targetExchangeId?: string;
    fieldType?: string;
    channel?: string;
    followUpTitle?: string;
    encounterId?: string;
    actionId?: string;
  } | null;

  const targetEmail = body?.targetEmail?.trim().toLowerCase() || "";
  const fieldType = body?.fieldType?.trim() || "";
  const channel = body?.channel?.trim() || fieldType;

  if (!targetEmail || !isAllowedFieldType(fieldType)) {
    return NextResponse.json({ error: "A valid contact request is required." }, { status: 400 });
  }

  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true });
  }

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase
    .from("contact_field_requests")
    .insert({
      workspace_id: user.workspaceId,
      requester_user_id: user.id,
      target_email: targetEmail,
      target_exchange_id: body?.targetExchangeId?.trim() || null,
      field_type: fieldType,
      channel,
      follow_up_title: body?.followUpTitle?.trim() || "",
      encounter_id: body?.encounterId?.trim() || null,
      action_id: body?.actionId?.trim() || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not send this request." }, { status: 500 });
  }

  // The row used to be the whole story: it was written, {ok:true} came back, and
  // the person being asked was never told anything. They had to happen to open
  // the app and happen to look. "Push delivery will be wired when device tokens
  // are available" sat here long after push_tokens and dispatchPushForUser
  // existed and were in use by four other surfaces.
  //
  // Scoped by address, like the connection thread and follow-ups addressed to
  // you: a request reaches the person it names and nobody else. Service client,
  // because the notification belongs in their workspace, not the requester's.
  //
  // Best effort - the request itself has already been recorded, so a failure to
  // notify must not fail it. It must still say why, or this becomes another
  // request that silently reaches nobody.
  try {
    const service = createServiceSupabaseClient();
    if (service) {
      const { data: target } = await service
        .from("users")
        .select("id, notification_preferences, workspace_memberships(workspace_id)")
        .ilike("primary_email", targetEmail)
        .maybeSingle();

      const targetUserId = target?.id as string | undefined;
      const memberships = target?.workspace_memberships as { workspace_id: string }[] | { workspace_id: string } | null;
      const targetWorkspaceId = Array.isArray(memberships)
        ? memberships[0]?.workspace_id
        : memberships?.workspace_id;

      if (!targetUserId || !targetWorkspaceId) {
        // Not an error: plenty of requests go to someone with no ehllo account
        // yet. Worth recording, because "they never got it" and "they have no
        // account" look identical from the requester's side.
        console.warn("[contact-requests] nobody to notify for this address", { requestId: data.id });
      } else if (notificationTypeEnabled(target?.notification_preferences, "contact_request")) {
        const requesterName = user.displayName?.trim() || user.email?.trim() || "Someone";
        const title = `${requesterName} asked for your ${fieldType.replace(/_/g, " ")}`;
        const noticeBody = body?.followUpTitle?.trim()
          ? `To follow up on: ${body.followUpTitle.trim()}`
          : "Open ehllo to share it or decline.";

        const created = await createNotification(service, {
          userId: targetUserId,
          workspaceId: targetWorkspaceId,
          type: "contact_request",
          title,
          body: noticeBody,
          encounterId: body?.encounterId?.trim() || undefined,
          actionId: body?.actionId?.trim() || undefined,
          dedupeKey: `contact_request:${data.id}`,
        });
        if (created) {
          await dispatchPushForUser(service, {
            userId: targetUserId,
            type: "contact_request",
            title,
            body: noticeBody,
            encounterId: body?.encounterId?.trim() || undefined,
            actionId: body?.actionId?.trim() || undefined,
          });
        }
      }
    }
  } catch (caught) {
    console.error("[contact-requests] recorded, but notifying the target threw", {
      requestId: data.id,
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }

  return NextResponse.json({ ok: true, requestId: data.id }, { headers: { "Cache-Control": "private, no-store" } });
}
