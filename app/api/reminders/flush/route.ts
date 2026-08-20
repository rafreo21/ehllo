import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";
import {
  REMINDER_USER_COLUMNS,
  sendReminderDigest,
  type ReminderUser,
} from "../../../../lib/reminder-digest-server";
import { createServiceSupabaseClient } from "../../../../lib/supabase/service";

/**
 * Sends your reminder digest now, if it is due.
 *
 * This is the mechanism; the daily cron is the safety net. Our plan allows a scheduled job
 * to run once a day, so the server alone can never deliver at three different local times
 * - which is why the digest went out at a fixed hour to everybody no matter what you had
 * chosen. The app knows the local clock, so it asks when it opens.
 *
 * The same shape already used for pushing calendar events, where the note reads "the cron
 * is the safety net, not the mechanism". Both paths go through sendReminderDigest and
 * therefore through reminderDigestDue, so the phone and the daily run cannot disagree
 * about whether you have already been reminded today.
 *
 * Only ever for the caller's own account. It takes no user id, so being able to call it
 * gives you nothing but your own reminders - and being due is decided server-side from
 * stored preferences, so a client cannot talk itself into an extra one.
 */
export async function POST(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, sent: false, reason: "preview" });
  }

  // The digest reads across encounters this person only partly owns - a claimed
  // participant's follow-ups live in somebody else's workspace - and it writes
  // reminder_last_sent_at. Same reason the cron uses the service client.
  const service = createServiceSupabaseClient();
  if (!service) return NextResponse.json({ error: "Reminders are not configured." }, { status: 503 });

  // Read through the caller's own client first, so the row this runs against is one they
  // are entitled to see rather than one named by the request.
  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase
    .from("users")
    .select(REMINDER_USER_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "We couldn’t check your reminders." }, { status: 500 });
  }

  const outcome = await sendReminderDigest(service, data as ReminderUser, {
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://ehllo.io",
    now: new Date(),
  });

  // The reason travels back so a quiet answer is legible rather than looking like a
  // failure: "not yet your time" and "nothing to remind you about" are different things.
  return NextResponse.json({
    ok: true,
    sent: outcome.sent,
    emailSent: outcome.emailSent,
    reason: outcome.reason,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
