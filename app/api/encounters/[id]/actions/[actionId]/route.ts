import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../../lib/auth/api-request";
import { encounterFromApi, normalizeEncounterActions, type EncounterAction } from "../../../../../../lib/encounters";
import { fetchParticipantsByEncounter } from "../../../../../../lib/encounter-participants-server";
import { createNotification, notificationTypeEnabled } from "../../../../../../lib/notifications-server";
import { dispatchPushForUser } from "../../../../../../lib/push-dispatch-server";
import { createServiceSupabaseClient } from "../../../../../../lib/supabase/service";
import {
  FOLLOW_UP_STATUSES,
  applyFollowUpTransition,
  canTransitionFollowUp,
  isFollowUpReviewGated,
  isFutureSnoozeTarget,
  type FollowUpStatus,
} from "../../../../../../lib/follow-up-lifecycle";

const allowedStatuses = new Set<string>(FOLLOW_UP_STATUSES);


/**
 * Tell the other party a shared follow-up was ticked off.
 *
 * A follow-up is an agreement between two people, and completing one was silent on
 * both sides: the person who was waiting had no way to know except by opening the
 * app and noticing. This is the moment worth telling them about.
 *
 * Reaches the person the follow-up names, by address, the same way the connection
 * thread and follow-ups-addressed-to-you are scoped - so it only ever goes to
 * someone the follow-up was actually about, and only if they have an ehllo account.
 *
 * Best effort throughout: the completion has already been written and must stand
 * whatever happens here. It logs the reason on failure rather than failing quietly,
 * because a notification nobody receives and nobody can explain is how this surface
 * kept going wrong.
 */
async function notifyFollowUpCompleted(input: {
  recipientEmail: string;
  completedByName: string;
  followUpTitle: string;
  encounterId: string;
  actionId: string;
}) {
  const email = input.recipientEmail.trim().toLowerCase();
  if (!email.includes("@")) return;

  try {
    const service = createServiceSupabaseClient();
    if (!service) return;

    const { data: target } = await service
      .from("users")
      .select("id, notification_preferences, workspace_memberships(workspace_id)")
      .ilike("primary_email", email)
      .maybeSingle();

    const userId = target?.id as string | undefined;
    const memberships = target?.workspace_memberships as { workspace_id: string }[] | { workspace_id: string } | null;
    const workspaceId = Array.isArray(memberships) ? memberships[0]?.workspace_id : memberships?.workspace_id;

    if (!userId || !workspaceId) {
      // Not an error: plenty of follow-ups name someone with no ehllo account yet.
      // Worth recording, because "they never got it" and "they have no account" look
      // identical from the outside.
      console.warn("[follow-up-completed] nobody to notify for this address", { actionId: input.actionId });
      return;
    }
    if (!notificationTypeEnabled(target?.notification_preferences, "follow_up_completed")) return;

    const title = `${input.completedByName || "Someone"} completed a follow-up`;
    const body = input.followUpTitle.trim() || "Open ehllo to see it.";

    const created = await createNotification(service, {
      userId,
      workspaceId,
      type: "follow_up_completed",
      title,
      body,
      encounterId: input.encounterId,
      actionId: input.actionId,
      dedupeKey: `follow_up_completed:${input.actionId}`,
    });
    if (created) {
      await dispatchPushForUser(service, {
        userId,
        type: "follow_up_completed",
        title,
        body,
        encounterId: input.encounterId,
        actionId: input.actionId,
      });
    }
  } catch (caught) {
    console.error("[follow-up-completed] notifying the other party threw", {
      actionId: input.actionId,
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; actionId: string }> },
) {
  const { id, actionId } = await context.params;
  const body = await request.json().catch(() => null) as {
    status?: string;
    snoozedUntil?: string;
    action?: EncounterAction;
    expectedStatusUpdatedAt?: string | null;
  } | null;
  const status = body?.status?.trim();

  if (!body) {
    return NextResponse.json({ error: "A valid action update is required." }, { status: 400 });
  }
  if (!body?.action && (!status || !allowedStatuses.has(status))) {
    return NextResponse.json({ error: "A valid action update is required." }, { status: 400 });
  }
  if (body.action && (body.action.id !== actionId || !allowedStatuses.has(body.action.status))) {
    return NextResponse.json({ error: "The follow-up update is invalid." }, { status: 400 });
  }

  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true });
  }

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase
    .from("encounters")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", user.workspaceId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Encounter not found." }, { status: 404 });
  }

  const actions = Array.isArray(data.actions) ? data.actions as EncounterAction[] : [];
  const index = actions.findIndex((action) => action.id === actionId);
  if (index < 0) {
    return NextResponse.json({ error: "Follow-up not found." }, { status: 404 });
  }

  const currentAction = actions[index];
  if (Object.hasOwn(body, "expectedStatusUpdatedAt")
    && (currentAction.statusUpdatedAt ?? null) !== (body.expectedStatusUpdatedAt ?? null)) {
    return NextResponse.json({
      error: "This follow-up changed on another device. Refresh to see its latest state before changing it again.",
      conflict: true,
      encounter: encounterFromApi({ ...data, participants: (await fetchParticipantsByEncounter(supabase, [id])).get(id) ?? [] }),
    }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  }
  if (isFollowUpReviewGated(data.status, currentAction.status)) {
    return NextResponse.json(
      { error: "Confirm the encounter review before updating this follow-up." },
      { status: 409 },
    );
  }

  const nextStatus = (body.action?.status || status || currentAction.status) as FollowUpStatus;
  if (!canTransitionFollowUp(currentAction.status, nextStatus)) {
    return NextResponse.json(
      { error: `This follow-up cannot move from ${currentAction.status} to ${nextStatus}.` },
      { status: 409 },
    );
  }

  const snoozedUntil = body.snoozedUntil || body.action?.snoozedUntil;
  if (nextStatus === "snoozed" && !isFutureSnoozeTarget(snoozedUntil)) {
    return NextResponse.json(
      { error: "Choose a future time to snooze this follow-up." },
      { status: 400 },
    );
  }

  const mergedActions = actions.map((action, actionIndex) => (
    actionIndex === index
      ? applyFollowUpTransition(
          {
            ...action,
            ...(body.action || {}),
            id: action.id,
            // The requested status is the transition target. Keep the stored
            // status here so the lifecycle guard can validate the real change.
            status: action.status,
          },
          nextStatus,
          undefined,
          snoozedUntil,
        )
      : action
  ));
  const participants = (await fetchParticipantsByEncounter(supabase, [id])).get(id) ?? [];
  const nextActions = normalizeEncounterActions(mergedActions, participants, {
    name: typeof data.person_name === "string" ? data.person_name : "",
    email: typeof data.person_email === "string" ? data.person_email : "",
  });

  const updatedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("encounters")
    .update({ actions: nextActions, updated_at: updatedAt })
    .eq("id", id)
    .eq("workspace_id", user.workspaceId)
    .eq("updated_at", data.updated_at)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: "Could not update this follow-up." }, { status: 500 });
  }
  if (!updated) {
    const { data: latest } = await supabase.from("encounters").select("*")
      .eq("id", id).eq("workspace_id", user.workspaceId).maybeSingle();
    const latestParticipants = latest
      ? (await fetchParticipantsByEncounter(supabase, [id])).get(id) ?? []
      : [];
    return NextResponse.json({
      error: "This follow-up changed while it was saving. Refresh to see the latest state before trying again.",
      conflict: true,
      encounter: latest ? encounterFromApi({ ...latest, participants: latestParticipants }) : undefined,
    }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  }

  // Only on the transition into completed, and only when it is a real change -
  // re-saving an already-complete follow-up should not ping anyone a second time.
  // The dedupe key covers a retry; this covers the ordinary case.
  if (nextStatus === "completed" && currentAction.status !== "completed") {
    const participant = currentAction.participantId
      ? participants.find((candidate) => candidate.id === currentAction.participantId)
      : undefined;
    const recipientEmail = participant?.email?.trim()
      || (typeof data.person_email === "string" ? data.person_email.trim() : "");

    await notifyFollowUpCompleted({
      recipientEmail,
      completedByName: user.displayName?.trim() || user.email?.trim() || "",
      followUpTitle: currentAction.title ?? "",
      encounterId: id,
      actionId,
    });
  }

  return NextResponse.json({
    ok: true,
    encounter: encounterFromApi({ ...updated, participants }),
  });
}
