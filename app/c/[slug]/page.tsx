import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  filterMethodsForCompanyVisibility,
  publicCompanyField,
  publicCompanyLogoUrl,
} from "@/lib/card-company-display";
import { publicCardImageUrl } from "@/lib/card-assets";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { PublicCardClient } from "./PublicCardClient";
import "./public-card.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ event?: string | string[] }>;

async function getCard(slug: string) {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const supabase = createServiceSupabaseClient()
    ?? createClient(url, key, { auth: { persistSession: false } });
  const { data } = await supabase
    .from("cards")
    .select("*, card_methods(*)")
    .eq("slug", slug.toLowerCase())
    .eq("status", "published")
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const card = await getCard(slug);
  return card
    ? {
        title: `${card.full_name} · AfterMeet`,
        description: [card.job_title, card.company].filter(Boolean).join(" at "),
      }
    : { title: "Contact card · AfterMeet" };
}

export default async function PublicCardPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const query = await searchParams;
  const eventTitle = (Array.isArray(query.event) ? query.event[0] : query.event)?.trim().slice(0, 160) ?? "";
  const card = await getCard(slug);
  if (!card) notFound();
  const methods = [...(card.card_methods || [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const showCompanyDetails = card.show_company_details ?? true;
  return (
    <PublicCardClient
      slug={slug}
      eventTitle={eventTitle}
      ownerName={card.full_name}
      jobTitle={card.job_title}
      company={publicCompanyField(card.company, showCompanyDetails)}
      companyLogoUrl={publicCardImageUrl(publicCompanyLogoUrl(card.company_logo_url, showCompanyDetails))}
      showCompanyDetails={showCompanyDetails}
      bio={card.bio}
      coverImageUrl={publicCardImageUrl(card.cover_image_url)}
      profileImageUrl={publicCardImageUrl(card.profile_image_url)}
      themeColor={card.theme_color}
      methods={filterMethodsForCompanyVisibility(methods, showCompanyDetails)}
    />
  );
}
