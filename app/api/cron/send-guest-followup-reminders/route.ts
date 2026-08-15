import { NextResponse } from "next/server";

import { encounterFromApi } from "../../../../lib/encounters";
import { fetchParticipantsByEncounter } from "../../../../lib/encounter-participants-server";
import { flattenOpenFollowUps } from "../../../../lib/follow-ups-server";
import { isFollowUpReminderEligible } from "../../../../lib/follow-up-lifecycle";
import { buildGuestFollowUpReminderEmail } from "../../../../lib/guest-followup-reminder-email";
import { sendEmail } from "../../../../lib/send-email";
import { createServiceSupabaseClient } from "../../../../lib/supabase/service";

const MIN_AGE_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Service client is not configured." }, { status: 503 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://ehllo.io";
  const cutoff = new Date(Date.now() - MIN_AGE_DAYS * DAY_MS).toISOString();

  const { data: encounterRows, error } = await service
    .from("encounters")
    .select("*")
    .lte("created_at", cutoff)
    .limit(500);

  if (error) {
    return NextResponse.json({ error: "Could not load encounters." }, { status: 500 });
  }

  let scanned = 0;
  let emailsSent = 0;
  let emailsFailed = 0;

  const encounterIds = (encounterRows ?? []).map((row) => row.id as string);
  const participantsByEncounter = await fetchParticipantsByEncounter(service, encounterIds);
  const encounters = (encounterRows ?? []).map((row) => encounterFromApi({
    ...row,
    participants: participantsByEncounter.get(row.id as string) ?? [],
  }));

  for (const encounter of encounters) {
    const guestItems = flattenOpenFollowUps([encounter]).filter((item) => (
      item.owner === "guest" && isFollowUpReminderEligible(item) && item.personEmail.trim()
    ));
    if (!guestItems.length) continue;

    const { data: alreadySent } = await service
      .from("guest_followup_reminders")
      .select("action_id")
      .eq("encounter_id", encounter.id)
      .in("action_id", guestItems.map((item) => item.actionId));
    const sentActionIds = new Set((alreadySent ?? []).map((row) => row.action_id as string));

    for (const item of guestItems) {
      scanned += 1;
      if (sentActionIds.has(item.actionId)) continue;

      const { subject, html } = buildGuestFollowUpReminderEmail({
        guestName: item.personName,
        hostName: encounter.personName,
        actionTitle: item.title,
        shareUrl: `${appUrl}/e/${encounter.shareToken}`,
      });
      const result = await sendEmail({ to: item.personEmail.trim(), subject, html });

      // Recorded regardless of outcome — a bad address should never retry
      // forever, matching the notifications table's at-most-once pattern.
      await service.from("guest_followup_reminders").insert({
        encounter_id: encounter.id,
        action_id: item.actionId,
      }).select().maybeSingle();

      if (result.ok) emailsSent += 1;
      else emailsFailed += 1;
    }
  }

  return NextResponse.json({ ok: true, scanned, emailsSent, emailsFailed });
}
