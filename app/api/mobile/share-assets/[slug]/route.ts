import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { ShareAssetProfile } from "../../../../../lib/share-assets";
import { buildBrandedQrDataUri } from "../../../../../lib/branded-qr.ts";
import { resolveShareQrPayload } from "../../../../../lib/contact-qr.ts";
import { getAppUserFromRequest } from "../../../../../lib/auth/mobile-api-auth";
import { readPublicSupabaseConfig } from "../../../../../lib/supabase/env";
import { normalizeThemeColor } from "../../../../../lib/theme-contrast.ts";

function cardUrlForSlug(slug: string, request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const origin = configured || new URL(request.url).origin;
  return `${origin.replace(/\/+$/, "")}/c/${slug}`;
}

async function loadShareAssetProfile(
  slug: string,
  request: Request,
  workspaceId: string,
  accessToken: string,
): Promise<ShareAssetProfile | null> {
  const config = readPublicSupabaseConfig().config;
  if (!config) return null;
  const supabase = createSupabaseClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await supabase
    .from("cards")
    .select("slug, full_name, job_title, company, theme_color, profile_image_url, company_logo_url, cover_image_url, show_company_details, status, card_methods(method_type, value, label, sort_order)")
    .eq("slug", slug.toLowerCase())
    .eq("workspace_id", workspaceId)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data) return null;

  return {
    name: data.full_name,
    role: data.job_title ?? "",
    company: data.company ?? "",
    cardUrl: cardUrlForSlug(data.slug, request),
    themeColor: data.theme_color ?? "#9fe870",
    photoUrl: data.profile_image_url ?? "",
    companyLogoUrl: data.company_logo_url ?? "",
    coverPhotoUrl: data.cover_image_url ?? "",
    showCompany: data.show_company_details ?? true,
    methods: [...(data.card_methods || [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((method) => ({
        method_type: method.method_type,
        value: method.value,
        label: method.label,
      })),
  };
}

function applyThemeOverride(profile: ShareAssetProfile, request: Request) {
  const themeOverride = new URL(request.url).searchParams.get("themeColor")?.trim();
  if (!themeOverride) return profile;
  return { ...profile, themeColor: normalizeThemeColor(themeOverride) };
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const authHeader = request.headers.get("Authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const user = await getAppUserFromRequest(request);
  if (!user || !accessToken) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { slug } = await context.params;
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) {
    return NextResponse.json({ error: "A card slug is required." }, { status: 400 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type")?.trim().toLowerCase();
  if (type === "branded-qr") {
    const profile = await loadShareAssetProfile(normalized, request, user.workspaceId, accessToken);
    if (!profile) {
      return NextResponse.json({ error: "Publish this card before downloading share assets." }, { status: 404 });
    }
    const size = Math.min(Math.max(Number(url.searchParams.get("size") || 512), 256), 1600);
    try {
      const dataUri = await buildBrandedQrDataUri(resolveShareQrPayload(profile), size);
      return NextResponse.json({ dataUri });
    } catch (error) {
      console.error("branded QR generation failed", error);
      return NextResponse.json({ error: "We couldn’t generate this QR code. Try again in a moment." }, { status: 500 });
    }
  }

  if (type !== "virtual-background" && type !== "watch-face") {
    return NextResponse.json({
      error: "Pass type=virtual-background, type=watch-face, or type=branded-qr.",
    }, { status: 400 });
  }

  const loaded = await loadShareAssetProfile(normalized, request, user.workspaceId, accessToken);
  if (!loaded) {
    return NextResponse.json({ error: "Publish this card before downloading share assets." }, { status: 404 });
  }
  const profile = applyThemeOverride(loaded, request);

  try {
    const { renderVirtualBackgroundOrWatchFace } = await import("../../../../../lib/share-assets-handler");
    // ?mirrored=1 pre-flips the virtual background so it reads correctly in your own
    // self-view. Absent means the participant-correct export, which is the one whose QR scans.
    const mirrored = url.searchParams.get("mirrored") === "1";
    const rendered = await renderVirtualBackgroundOrWatchFace(type, profile, normalized, mirrored);

    return new NextResponse(rendered.body, {
      headers: {
        "Content-Type": rendered.contentType,
        "Content-Disposition": `attachment; filename="${rendered.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("share-asset generation failed", error);
    return NextResponse.json({ error: "We couldn’t generate this image. Try again in a moment." }, { status: 500 });
  }
}
