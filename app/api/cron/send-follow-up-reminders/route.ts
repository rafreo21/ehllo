import { NextResponse } from "next/server";

import {
  REMINDER_USER_COLUMNS,
  sendReminderDigest,
  type ReminderUser,
} from "../../../../lib/reminder-digest-server";
import { createServiceSupabaseClient } from "../../../../lib/supabase/service";

// The per-user work lives in lib/reminder-digest-server.ts now, because the app calls it
// too. The plan allows one cron run a day, so this job cannot deliver at three different
// local times - it is the safety net, and the app asks for the exact hour. Both go through
// the same code and the same reminderDigestDue, so they cannot disagree about whether
// somebody has already been reminded today.
//
// startOfTodayIso used to live here and compared against the server's midnight, which on
// Vercel is UTC. That made "has it gone out today" somebody else's day for anyone not
// living in UTC, on top of ignoring the chosen times entirely.

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
    .select(REMINDER_USER_COLUMNS)
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
    const outcome = await sendReminderDigest(service, user, { appUrl, now });
    if (!outcome.sent) {
      notDue += 1;
      continue;
    }
    notificationsCreated += outcome.notificationsCreated;
    if (outcome.emailSent) emailsSent += 1;
    else if (outcome.reason === "email-failed") emailsFailed += 1;
  }

  // notDue reported so a quiet run is legible: "nobody was due yet" and "the job did not
  // work" used to look identical from the outside.
  return NextResponse.json({ ok: true, scanned, notDue, emailsSent, emailsFailed, notificationsCreated });
}
