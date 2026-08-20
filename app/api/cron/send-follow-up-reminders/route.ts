import { NextResponse } from "next/server";

import { encounterFromApi } from "../../../../lib/encounters";
import { fetchParticipantsByEncounter } from "../../../../lib/encounter-participants-server";
import { dueDateBucket, flattenOpenFollowUps, type FollowUpItem } from "../../../../lib/follow-ups-server";
import { isFollowUpReminderEligible } from "../../../../lib/follow-up-lifecycle";
import { createNotification, notificationTypeEnabled } from "../../../../lib/notifications-server";
import { dispatchPushForUser } from "../../../../lib/push-dispatch-server";
import { buildReminderDigestEmail, reminderQualifies } from "../../../../lib/reminder-email";
import { reminderDigestDue } from "../../../../lib/reminder-schedule";
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
  reminder_times: string[] | null;
  time_zone: string | null;
};

// startOfTodayIso used to live here and compared against the server's midnight, which on
// Vercel is UTC. That made "has it gone out today" somebody else's day for anyone not
// living in UTC, on top of ignoring the chosen times entirely. Both are now decided by
// reminderDigestDue, in the user's own zone.

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
  // One instant for the whole run, so two users are never judged against clocks a few
  // seconds apart.
  const now = new Date();

  // Email and in-app/push notifications are independent preferences, so this
  // scans every active user rather than only those with email reminders on -
  // the per-user branches below decide each channel separately.
  const { data: users, error: usersError } = await service
    .from("users")
    .select("id, auth_user_id, primary_email, status, reminder_emails_enabled, reminder_last_sent_at, notification_preferences, reminder_times, time_zone")
    .eq("status", "active")
    .limit(500);

  if (usersError) {
    return NextResponse.json({ error: "Could not load reminder recipients." }, { status: 500 });
  }

  let scanned = 0;
  let notDue = 0;
  let emailsSent = 0;
  let emailsFailed = 0;
  let notificationsCreated = 0;

  for (const user of (users ?? []) as ReminderUser[]) {
    scanned += 1;

    // Their chosen times, in their zone, before any of the work below. This is the fix for
    // being reminded at an hour you did not choose - and it gates the push notifications
    // too, not only the email, because those were the ones arriving at the wrong time.
    //
    // The cron is the safety net rather than the mechanism: the plan allows one run a day,
    // so it cannot fire at three local times. The device asks on open for the exact hour,
    // and this catches whoever never opened the app.
    const due = reminderDigestDue({
      now,
      timeZone: user.time_zone,
      reminderTimes: user.reminder_times,
      lastSentAt: user.reminder_last_sent_at,
    });
    if (!due.due) {
      notDue += 1;
      continue;
    }

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

    // In-app/push: one row per (user, type, encounter, action) ever - the
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

    // Cadence is decided once, above, for both channels. This used to keep its own
    // separate daily-once rule against the server's midnight, which is how the email and
    // the push could disagree about whether today had already happened.
    const emailEligible = user.reminder_emails_enabled && user.primary_email?.trim();

    let stamp = false;
    if (emailEligible) {
      const { subject, html } = buildReminderDigestEmail(qualifying, appUrl);
      const result = await sendEmail({ to: user.primary_email.trim(), subject, html });
      if (result.ok) {
        emailsSent += 1;
        stamp = true;
      } else {
        // Left unstamped so it is retried, rather than counted as sent because we tried.
        emailsFailed += 1;
      }
    } else {
      // Stamped even with no email to send. This column is now what "already reminded
      // today" is judged against for both channels, so leaving it untouched for anybody
      // with email reminders off meant they read as never reminded on every single run.
      stamp = true;
    }

    if (stamp) {
      await service
        .from("users")
        .update({ reminder_last_sent_at: now.toISOString() })
        .eq("id", user.id);
    }
  }

  // notDue reported so a quiet run is legible: "nobody was due yet" and "the job did not
  // work" used to look identical from the outside.
  return NextResponse.json({ ok: true, scanned, notDue, emailsSent, emailsFailed, notificationsCreated });
}
