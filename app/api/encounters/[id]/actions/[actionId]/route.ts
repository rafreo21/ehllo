import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../../lib/auth/api-request";
import { encounterFromApi, normalizeEncounterActions, type EncounterAction } from "../../../../../../lib/encounters";
import { fetchParticipantsByEncounter } from "../../../../../../lib/encounter-participants-server";
import {
  FOLLOW_UP_STATUSES,
  applyFollowUpTransition,
  canTransitionFollowUp,
  isFollowUpReviewGated,
  isFutureSnoozeTarget,
  type FollowUpStatus,
} from "../../../../../../lib/follow-up-lifecycle";

const allowedStatuses = new Set<string>(FOLLOW_UP_STATUSES);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; actionId: string }> },
) {
  const { id, actionId } = await context.params;
  const body = await request.json().catch(() => null) as {
    status?: string;
    snoozedUntil?: string;
    action?: EncounterAction;
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

  const { error: updateError } = await supabase
    .from("encounters")
    .update({ actions: nextActions, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", user.workspaceId);

  if (updateError) {
    return NextResponse.json({ error: "Could not update this follow-up." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    encounter: encounterFromApi({ ...data, actions: nextActions, participants }),
  });
}
