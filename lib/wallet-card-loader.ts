import type { WalletCardPayload } from "./wallet-config";

export function cardUrlForSlug(slug: string, request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const requestOrigin = new URL(request.url).origin;
  let origin = configured || requestOrigin;
  if (configured) {
    try {
      const configuredUrl = new URL(configured);
      const requestUrl = new URL(requestOrigin);
      const configuredIsLocal = configuredUrl.hostname === "localhost" || configuredUrl.hostname === "127.0.0.1";
      const requestIsLocal = requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";
      if (configuredIsLocal && !requestIsLocal) origin = requestOrigin;
    } catch {
      origin = requestOrigin;
    }
  }
  return `${origin.replace(/\/+$/, "")}/c/${slug}`;
}

type WalletCardRow = {
  slug: string;
  full_name: string;
  job_title: string | null;
  company: string | null;
  bio: string | null;
  theme_color: string | null;
  profile_image_url?: string | null;
  company_logo_url?: string | null;
  show_company_details?: boolean | null;
};

export function walletCardFromRow(row: WalletCardRow, request: Request): WalletCardPayload {
  return {
    slug: row.slug,
    fullName: row.full_name,
    role: row.job_title ?? "",
    company: row.company ?? "",
    bio: row.bio ?? "",
    themeColor: row.theme_color ?? "#9fe870",
    cardUrl: cardUrlForSlug(row.slug, request),
    profileImageUrl: row.profile_image_url ?? "",
    showCompany: row.show_company_details ?? true,
  };
}

// company_logo_url is deliberately absent. Neither wallet builder has ever read
// it - Apple has no free image slot on a storeCard whose strip already carries the
// photograph - so selecting it fetched a column on every pass request and dropped
// it. The column itself stays, and the public card and share-assets endpoints still
// use it; only this query stops asking for it.
export const WALLET_CARD_SELECT = "slug, full_name, job_title, company, bio, theme_color, profile_image_url, show_company_details, status";
