import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { publicCompanyField, filterMethodsForCompanyVisibility } from "../../../../../lib/card-company-display";
import { buildBrandedQrPngBuffer } from "../../../../../lib/branded-qr.ts";
import { buildContactQrPayload } from "../../../../../lib/contact-qr.ts";
import { cardUrlForSlug } from "../../../../../lib/wallet-card-loader";
import { createServiceSupabaseClient } from "../../../../../lib/supabase/service";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
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
    return NextResponse.json({ error: "Card lookup is not configured." }, { status: 503 });
  }

  // Published status is the public-data boundary. Prefer the server client
  // because production RLS intentionally denies anonymous table reads; the
  // public card and vCard routes use the same pattern.
  const supabase = createServiceSupabaseClient()
    ?? createClient(url, key, { auth: { persistSession: false } });
  const { data } = await supabase
    .from("cards")
    .select("slug, full_name, job_title, company, bio, show_company_details, status, card_methods(method_type, value, label, sort_order)")
    .eq("slug", normalized)
    .eq("status", "published")
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "Card not found." }, { status: 404 });
  }

  const size = Math.min(Math.max(Number(new URL(request.url).searchParams.get("size") || 512), 256), 1024);
  const cardUrl = cardUrlForSlug(data.slug, request);
  const offline = new URL(request.url).searchParams.get("mode") === "contact";
  let payload = cardUrl;
  if (offline) {
    const showCompanyDetails = data.show_company_details ?? true;
    const methods = filterMethodsForCompanyVisibility(
      [...(data.card_methods || [])].sort((a, b) => a.sort_order - b.sort_order),
      showCompanyDetails,
    );
    payload = buildContactQrPayload({
      fullName: data.full_name,
      jobTitle: data.job_title,
      company: publicCompanyField(data.company, showCompanyDetails),
      bio: data.bio,
      cardUrl,
      showCompanyDetails,
      methods: methods.map((method) => ({
        method_type: method.method_type,
        value: method.value,
        label: method.label,
      })),
    });
  }
  const buffer = await buildBrandedQrPngBuffer(payload, size);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
