import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";
import {
  NOTIFICATION_TYPES,
  notificationTypeEnabled,
  type NotificationType,
} from "../../../../lib/notifications-server";

function readPreferences(raw: unknown) {
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, notificationTypeEnabled(raw, type)]),
  ) as Record<NotificationType, boolean>;
}

export async function GET(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({
      emailRemindersEnabled: true,
      notificationPreferences: readPreferences(null),
      preview: true,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createApiSupabaseClient(request);
  const [reminderResult, userResult] = await Promise.all([
    supabase.rpc("get_my_reminder_preference"),
    supabase.from("users").select("notification_preferences").single(),
  ]);
  if (reminderResult.error) return NextResponse.json({ error: "We couldn’t load your reminder preferences." }, { status: 500 });

  return NextResponse.json({
    emailRemindersEnabled: Boolean(reminderResult.data),
    notificationPreferences: readPreferences(userResult.data?.notification_preferences),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    emailRemindersEnabled?: unknown;
    notificationPreferences?: unknown;
  } | null;

  if (user.id === "local-development-preview") {
    return NextResponse.json({
      emailRemindersEnabled: body?.emailRemindersEnabled !== false,
      notificationPreferences: readPreferences(body?.notificationPreferences),
      preview: true,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createApiSupabaseClient(request);
  let emailRemindersEnabled: boolean | undefined;

  if (typeof body?.emailRemindersEnabled === "boolean") {
    const { data, error } = await supabase.rpc("set_reminder_email_preference", { p_enabled: body.emailRemindersEnabled });
    if (error) return NextResponse.json({ error: "We couldn’t update your reminder preferences." }, { status: 500 });
    emailRemindersEnabled = Boolean(data);
  }

  let notificationPreferences: Record<NotificationType, boolean> | undefined;
  if (body?.notificationPreferences && typeof body.notificationPreferences === "object") {
    const next = readPreferences(body.notificationPreferences);
    const { error } = await supabase.from("users").update({ notification_preferences: next }).eq("id", user.id);
    if (error) return NextResponse.json({ error: "We couldn’t update your notification preferences." }, { status: 500 });
    notificationPreferences = next;
  }

  if (emailRemindersEnabled === undefined && notificationPreferences === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  return NextResponse.json({
    ...(emailRemindersEnabled !== undefined ? { emailRemindersEnabled } : {}),
    ...(notificationPreferences !== undefined ? { notificationPreferences } : {}),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
