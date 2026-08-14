import { NextResponse } from "next/server";

import { encounterFromApi } from "../../../../lib/encounters";
import { fetchParticipantsByEncounter } from "../../../../lib/encounter-participants-server";
import { dueDateBucket, flattenOpenFollowUps, type FollowUpItem } from "../../../../lib/follow-ups-server";
import { isFollowUpReminderEligible } from "../../../../lib/follow-up-lifecycle";
import { createNotification, notificationTypeEnabled } from "../../../../lib/notifications-server";
import { dispatchPushForUser } from "../../../../lib/push-dispatch-server";
import { buildReminderDigestEmail, reminderQualifies } from "../../../../lib/reminder-email";
import { sendEmail } from "../../../../lib/send-email";
import { createServiceSupabaseClient } from "../../../../lib/supabase/service";

type ReminderUser = {
  id: string;
  auth_user_id: string;
  primary_email: string;
  status: string;
  reminder_emails_enabled: boolean;
  reminder_last_sent_at: string | null;
  notification_preferences: unknown;
};

function startOfTodayIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

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
  const todayStart = startOfTodayIso();

  // Email and in-app/push notifications are independent preferences, so this
  // scans every active user rather than only those with email reminders on —
  // the per-user branches below decide each channel separately.
  const { data: users, error: usersError } = await service
    .from("users")
    .select("id, auth_user_id, primary_email, status, reminder_emails_enabled, reminder_last_sent_at, notification_preferences")
    .eq("status", "active")
    .limit(500);

  if (usersError) {
    return NextResponse.json({ error: "Could not load reminder recipients." }, { status: 500 });
  }

  let scanned = 0;
  let emailsSent = 0;
  let emailsFailed = 0;
  let notificationsCreated = 0;

  for (const user of (users ?? []) as ReminderUser[]) {
    scanned += 1;

    const qualifying: FollowUpItem[] = [];

    const { data: membership } = await service
      .from("workspace_memberships")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (membership?.workspace_id) {
      const { data: ownEncounters } = await service
        .from("encounters")
        .select("*")
        .eq("workspace_id", membership.workspace_id)
        .limit(250);

      if (ownEncounters?.length) {
        const encounterIds = ownEncounters.map((row) => row.id as string);
        const participantsByEncounter = await fetchParticipantsByEncounter(service, encounterIds);
        const encounters = ownEncounters.map((row) => encounterFromApi({
          ...row,
          participants: participantsByEncounter.get(row.id as string) ?? [],
        }));

        for (const item of flattenOpenFollowUps(encounters)) {
          if (item.owner === "me" && isFollowUpReminderEligible(item) && reminderQualifies(item)) {
            qualifying.push(item);
          }
        }
      }
    }

    const { data: claimedParticipants } = await service
      .from("encounter_participants")
      .select("id, encounter_id")
      .eq("claimed_by_user_id", user.id);

    if (claimedParticipants?.length) {
      const claimedEncounterIds = claimedParticipants.map((row) => row.encounter_id as string);
      const { data: claimedEncounters } = await service
        .from("encounters")
        .select("*")
        .in("id", claimedEncounterIds);

      if (claimedEncounters?.length) {
        const participantIdByEncounter = new Map(
          claimedParticipants.map((row) => [row.encounter_id as string, row.id as string]),
        );
        const encounters = claimedEncounters.map((row) => encounterFromApi({ ...row, participants: [] }));

        for (const item of flattenOpenFollowUps(encounters)) {
          const myParticipantId = participantIdByEncounter.get(item.encounterId);
          if (
            item.owner === "guest"
            && item.participantId === myParticipantId
            && isFollowUpReminderEligible(item)
            && reminderQualifies(item)
          ) {
            qualifying.push(item);
          }
        }
      }
    }

    if (!qualifying.length) continue;

    // In-app/push: one row per (user, type, encounter, action) ever — the
    // dedupe_key unique index makes this safe to run daily without spamming
    // the notification centre as an item stays due or overdue.
    if (membership?.workspace_id) {
      for (const item of qualifying) {
        const bucket = dueDateBucket(item.dueAt);
        const type = bucket === "overdue" ? "follow_up_overdue" : "follow_up_due";
        if (!notificationTypeEnabled(user.notification_preferences, type)) continue;
        try {
          const title = bucket === "overdue" ? `Overdue: ${item.title}` : `Due today: ${item.title}`;
          const notificationBody = item.personName.trim() ? `With ${item.personName.trim()}` : "";
          const created = await createNotification(service, {
            userId: user.id,
            workspaceId: membership.workspace_id,
            type,
            title,
            body: notificationBody,
            encounterId: item.encounterId,
            actionId: item.actionId,
            dedupeKey: `${type}:${item.encounterId}:${item.actionId}`,
          });
          if (created) {
            notificationsCreated += 1;
            await dispatchPushForUser(service, {
              userId: user.id,
              type,
              title,
              body: notificationBody,
              encounterId: item.encounterId,
              actionId: item.actionId,
            });
          }
        } catch {
          // A missed in-app notification must not block the email digest below.
        }
      }
    }

    // Email digest respects its own daily-once cadence, independent of
    // whether in-app notifications were created above.
    const emailEligible = user.reminder_emails_enabled
      && user.primary_email?.trim()
      && (!user.reminder_last_sent_at || user.reminder_last_sent_at < todayStart);
    if (!emailEligible) continue;

    const { subject, html } = buildReminderDigestEmail(qualifying, appUrl);
    const result = await sendEmail({ to: user.primary_email.trim(), subject, html });

    if (result.ok) {
      emailsSent += 1;
      await service
        .from("users")
        .update({ reminder_last_sent_at: new Date().toISOString() })
        .eq("id", user.id);
    } else {
      emailsFailed += 1;
    }
  }

  return NextResponse.json({ ok: true, scanned, emailsSent, emailsFailed, notificationsCreated });
}
