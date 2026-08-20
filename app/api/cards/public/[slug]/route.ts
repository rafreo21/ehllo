import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { cardSlugCandidates } from "../../../../../lib/card-slug";
import { publicCardImageUrl } from "../../../../../lib/card-assets";
import { publicCompanyLogoUrl } from "../../../../../lib/card-company-display";
import { createServiceSupabaseClient } from "../../../../../lib/supabase/service";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) {
    return NextResponse.json({ error: "A card slug is required." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "This card is unavailable right now." }, { status: 503 });
  }

  const supabase = createServiceSupabaseClient()
    ?? createClient(url, key, { auth: { persistSession: false } });
  // Tries the slug as given, then the prefixed form for a bare generated code. Both
  // wallet passes encode the slug with "card-" dropped to keep the QR at 29x29, so
  // without this the web scanner looked up a short slug, found nothing, and told
  // people a published card was not published.
  let data: Awaited<ReturnType<typeof lookupCard>> = null;
  async function lookupCard(candidate: string) {
    const result = await supabase
      .from("cards")
      .select("id, slug, full_name, job_title, company, bio, theme_color, profile_image_url, company_logo_url, cover_image_url, show_company_details, card_methods(method_type, value, label, sort_order)")
      .eq("slug", candidate)
      .eq("status", "published")
      .maybeSingle();
    return result.data;
  }
  for (const candidate of cardSlugCandidates(normalized)) {
    data = await lookupCard(candidate);
    if (data) break;
  }

  if (!data) {
    return NextResponse.json({ error: "This card is not published." }, { status: 404 });
  }

  const showCompanyDetails = data.show_company_details ?? true;
  const methods = [...(data.card_methods ?? [])]
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
    .map((method, index) => ({
      id: `${method.method_type}-${index}`,
      type: method.method_type,
      value: method.value,
      label: method.label || method.method_type,
      sortOrder: method.sort_order ?? index,
    }));

  const email = methods.find((method) => method.type === "email")?.value ?? "";
  const phone = methods.find((method) => ["phone", "whatsapp"].includes(method.type))?.value ?? "";
  const linkedinUrl = methods.find((method) => method.type === "linkedin")?.value ?? "";
  const whatsappUrl = methods.find((method) => method.type === "whatsapp")?.value ?? "";
  const instagramUrl = methods.find((method) => method.type === "instagram")?.value ?? "";
  const xUrl = methods.find((method) => method.type === "x")?.value ?? "";
  const tiktokUrl = methods.find((method) => method.type === "tiktok")?.value ?? "";

  return NextResponse.json({
    card: {
      id: data.id,
      slug: data.slug,
      fullName: data.full_name,
      role: data.job_title ?? "",
      company: data.company ?? "",
      bio: data.bio ?? "",
      themeColor: data.theme_color ?? "#9fe870",
      profileImageUrl: publicCardImageUrl(data.profile_image_url) ?? "",
      coverImageUrl: publicCardImageUrl(data.cover_image_url) ?? "",
      companyLogoUrl: publicCardImageUrl(publicCompanyLogoUrl(data.company_logo_url, showCompanyDetails)) ?? "",
      showCompanyDetails,
      email,
      phone,
      linkedinUrl,
      whatsappUrl,
      instagramUrl,
      xUrl,
      tiktokUrl,
      methods,
    },
  }, { headers: { "Cache-Control": "public, max-age=60" } });
}
