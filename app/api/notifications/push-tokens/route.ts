import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";

const PLATFORMS = new Set(["ios", "android"]);

export async function POST(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    deviceId?: unknown;
    platform?: unknown;
    expoPushToken?: unknown;
    deviceLabel?: unknown;
    deviceModel?: unknown;
  } | null;

  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim().slice(0, 200) : "";
  const platform = typeof body?.platform === "string" ? body.platform.trim() : "";
  const expoPushToken = typeof body?.expoPushToken === "string" ? body.expoPushToken.trim().slice(0, 400) : "";
  const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel.trim().slice(0, 160) : "";
  const deviceModel = typeof body?.deviceModel === "string" ? body.deviceModel.trim().slice(0, 160) : "";

  if (!deviceId || !PLATFORMS.has(platform) || !expoPushToken) {
    return NextResponse.json({ error: "A device id, platform, and push token are required." }, { status: 400 });
  }

  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createApiSupabaseClient(request);

  // A token Expo previously issued to a different install must be released
  // before this device can claim it - the active-token unique index would
  // otherwise reject the upsert below.
  await supabase
    .from("push_tokens")
    .update({ disabled_at: new Date().toISOString() })
    .eq("expo_push_token", expoPushToken)
    .neq("device_id", deviceId)
    .is("disabled_at", null);

  const { error } = await supabase.from("push_tokens").upsert({
    user_id: user.id,
    device_id: deviceId,
    platform,
    expo_push_token: expoPushToken,
    device_label: deviceLabel,
    device_model: deviceModel,
    last_seen_at: new Date().toISOString(),
    disabled_at: null,
  }, { onConflict: "user_id,device_id" });

  if (error) {
    return NextResponse.json({ error: "We couldn’t register this device for notifications." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId")?.trim().slice(0, 200) || "";
  if (!deviceId) return NextResponse.json({ error: "A device id is required." }, { status: 400 });

  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createApiSupabaseClient(request);
  const { error } = await supabase
    .from("push_tokens")
    .update({ disabled_at: new Date().toISOString() })
    .eq("device_id", deviceId);

  if (error) {
    return NextResponse.json({ error: "We couldn’t deactivate this device." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
