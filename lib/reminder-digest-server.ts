import { encounterFromApi } from "./encounters";
import { fetchParticipantsByEncounter } from "./encounter-participants-server";
import { dueDateBucket, flattenOpenFollowUps, type FollowUpItem } from "./follow-ups-server";
import { isFollowUpReminderEligible } from "./follow-up-lifecycle";
import { createNotification, notificationTypeEnabled } from "./notifications-server";
import { dispatchPushForUser } from "./push-dispatch-server";
import { buildReminderDigestEmail, reminderQualifies } from "./reminder-email";
import { reminderDigestDue } from "./reminder-schedule";
import { sendEmail } from "./send-email";

/**
 * Sending one person their reminder digest.
 *
 * Lifted out of the cron route unchanged so a second caller can use it. The plan allows
 * one cron run a day, which is why the digest could never land at three different local
 * times: a job that wakes once cannot. So the app asks when it opens - the same shape
 * already used for pushing calendar events, where the comment reads "the cron is the
 * safety net, not the mechanism".
 *
 * Both callers share this, and both share reminderDigestDue, so the phone and the daily
 * run cannot disagree about whether somebody has already been reminded today.
 */
export type ReminderUser = {
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

/** Everything the digest needs from the user row, so both callers select the same columns. */
export const REMINDER_USER_COLUMNS =
  "id, auth_user_id, primary_email, status, reminder_emails_enabled, reminder_last_sent_at, notification_preferences, reminder_times, time_zone";

export type ReminderDigestOutcome = {
  sent: boolean;
  emailSent: boolean;
  notificationsCreated: number;
  /** Why nothing was sent, when nothing was - so a quiet result can be explained. */
  reason: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type ServiceClient = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function sendReminderDigest(
  service: ServiceClient,
  user: ReminderUser,
  options: { appUrl: string; now: Date },
): Promise<ReminderDigestOutcome> {
  const { appUrl, now } = options;
  let notificationsCreated = 0;
  let emailSent = false;
  let emailFailed = false;

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
    return { sent: false, emailSent: false, notificationsCreated: 0, reason: due.reason };
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
      const encounterIds = ownEncounters.map((row: { id: string }) => row.id);
      const participantsByEncounter = await fetchParticipantsByEncounter(service, encounterIds);
      const encounters = ownEncounters.map((row: { id: string }) => encounterFromApi({
        ...row,
        participants: participantsByEncounter.get(row.id) ?? [],
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
    const claimedEncounterIds = claimedParticipants.map((row: { encounter_id: string }) => row.encounter_id);
    const { data: claimedEncounters } = await service
      .from("encounters")
      .select("*")
      .in("id", claimedEncounterIds);

    if (claimedEncounters?.length) {
      const participantIdByEncounter = new Map(
        claimedParticipants.map((row: { encounter_id: string; id: string }) => [row.encounter_id, row.id]),
      );
      const encounters = claimedEncounters.map((row: Record<string, unknown>) => encounterFromApi({ ...row, participants: [] }));

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

  if (!qualifying.length) return { sent: false, emailSent: false, notificationsCreated, reason: "nothing-due" };

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
      emailSent = true;
      stamp = true;
    } else {
      // Left unstamped so it is retried, rather than counted as sent because we tried.
      emailFailed = true;
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

  return {
    sent: true,
    emailSent,
    notificationsCreated,
    reason: emailFailed ? "email-failed" : "sent",
  };
}
