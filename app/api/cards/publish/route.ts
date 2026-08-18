import { NextResponse } from "next/server";

import { MAX_CARDS } from "../../../../lib/card-library";
import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";
import { resolveCardImagesForPublish } from "../../../../lib/card-publish-images";
import { createServiceSupabaseClient } from "../../../../lib/supabase/service";

const slugPattern = /^card-[a-f0-9]{16}$|^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const themePattern = /^#[0-9a-f]{6}$/i;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const methods = Array.isArray(body?.methods) ? body.methods : [];
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const theme = typeof body?.theme === "string" ? body.theme : "";
  const expectedUpdatedAt = typeof body?.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null;

  if (!slugPattern.test(slug) || name.length < 2 || name.length > 100 || !themePattern.test(theme)) {
    return NextResponse.json({ error: "Complete the card name and design before publishing." }, { status: 400 });
  }
  if (methods.length > 30) {
    return NextResponse.json({ error: "This card has too many contact methods." }, { status: 400 });
  }

  const safeMethods = methods.flatMap((method, sortOrder) => {
    if (!method || typeof method !== "object") return [];
    const item = method as Record<string, unknown>;
    if (typeof item.type !== "string" || typeof item.value !== "string" || !item.value.trim()) return [];
    return [{
      type: item.type,
      value: item.value.trim(),
      label: typeof item.label === "string" ? item.label.trim() : "",
      sortOrder,
    }];
  });

  if (!safeMethods.length) {
    return NextResponse.json({ error: "Add at least one contact method before publishing." }, { status: 400 });
  }

  if (process.env.NODE_ENV === "development" && process.env.AFTERMEET_DEV_PREVIEW === "true") {
    return NextResponse.json({ ok: true, preview: true, maxCards: MAX_CARDS });
  }

  const user = await resolveApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  }
  const supabase = await createApiSupabaseClient(request);

  const cardId = typeof body?.id === "string" ? body.id.trim() : "";
  let photo = typeof body?.photo === "string" ? body.photo : "";
  let companyLogo = typeof body?.companyLogo === "string" ? body.companyLogo : "";
  let coverPhoto = typeof body?.coverPhoto === "string" ? body.coverPhoto : "";

  const service = createServiceSupabaseClient();
  if (service && cardId) {
    if (user.workspaceId) {
      try {
        const resolved = await resolveCardImagesForPublish(service, user.workspaceId, cardId, {
          photo,
          coverPhoto,
          companyLogo,
        });
        photo = resolved.photo;
        coverPhoto = resolved.coverPhoto;
        companyLogo = resolved.companyLogo;
      } catch {
        return NextResponse.json({ error: "We couldn’t upload your card images before publishing." }, { status: 500 });
      }
    }
  }

  const { data, error } = await supabase.rpc("publish_my_card", {
    p_slug: slug,
    p_full_name: name,
    p_job_title: typeof body?.role === "string" ? body.role.trim() : "",
    p_company: typeof body?.company === "string" ? body.company.trim() : "",
    p_bio: typeof body?.bio === "string" ? body.bio.trim() : "",
    p_theme_color: theme,
    p_profile_image_url: photo,
    p_company_logo_url: companyLogo,
    p_cover_image_url: coverPhoto,
    p_show_company_details: body?.showCompanyDetails !== false,
    p_methods: safeMethods,
    p_expected_updated_at: expectedUpdatedAt,
  });

  if (error) {
    const limitReached = error.message.toLowerCase().includes("five active cards");
    const conflict = error.message.toLowerCase().includes("card_conflict");

    // The clients' whole recovery path keys off serverUpdatedAt: adopt the value,
    // then publish again. /api/cards has always returned it on a conflict and this
    // route never did, so a publish conflict was unrecoverable by design - the
    // message said "reload the latest card" while withholding the one field that
    // makes reloading possible.
    let serverUpdatedAt: string | null = null;
    if (conflict) {
      const { data: current } = await supabase
        .from("cards")
        .select("updated_at")
        .eq("workspace_id", user.workspaceId)
        .eq("slug", slug.toLowerCase())
        .maybeSingle();
      serverUpdatedAt = (current?.updated_at as string | null | undefined) ?? null;
    }

    return NextResponse.json(
      {
        error: conflict
          ? "This card changed on another device. Reload the latest card before publishing again."
          : limitReached ? `You can publish a maximum of ${MAX_CARDS} cards.` : "We couldn’t publish this card.",
        ...(conflict ? { conflict: true } : {}),
        ...(serverUpdatedAt ? { serverUpdatedAt } : {}),
      },
      { status: limitReached || conflict ? 409 : 500 },
    );
  }
  const { data: publishedCard } = await supabase
    .from("cards")
    .select("updated_at")
    .eq("id", data)
    .eq("workspace_id", user.workspaceId)
    .maybeSingle();
  return NextResponse.json({
    ok: true,
    cardId: data,
    updatedAt: publishedCard?.updated_at,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
