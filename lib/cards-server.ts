import type { LibraryCard, LibraryMethod } from "./card-library";

export type CardRow = {
  id: string;
  workspace_id: string;
  slug: string;
  label: string;
  full_name: string;
  job_title: string;
  company: string;
  bio: string;
  theme_color: string;
  profile_image_url: string;
  company_logo_url: string;
  cover_image_url: string;
  show_company_details: boolean;
  status: "draft" | "published" | "archived";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CardMethodRow = {
  id: string;
  card_id: string;
  method_type: string;
  value: string;
  label: string;
  sort_order: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCardUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function libraryCardFromRows(card: CardRow, methods: CardMethodRow[]): LibraryCard {
  return {
    id: card.id,
    slug: card.slug,
    label: card.label || card.full_name || "My card",
    name: card.full_name,
    role: card.job_title,
    company: card.company,
    bio: card.bio,
    theme: card.theme_color,
    photo: card.profile_image_url,
    companyLogo: card.company_logo_url,
    coverPhoto: card.cover_image_url,
    showCompanyDetails: card.show_company_details ?? true,
    methods: [...methods]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((method, index) => ({
        id: method.id || `${method.method_type}-${index}`,
        type: method.method_type,
        value: method.value,
        label: method.label,
      })),
    createdAt: card.created_at,
    updatedAt: card.updated_at,
    status: card.status === "published" ? "published" : "draft",
    publishedAt: card.published_at,
  };
}

export function libraryCardToRow(
  card: LibraryCard,
  workspaceId: string,
  status: CardRow["status"] = "draft",
  existingId?: string,
) {
  return {
    id: existingId || (isCardUuid(card.id) ? card.id : crypto.randomUUID()),
    workspace_id: workspaceId,
    slug: card.slug.trim().toLowerCase(),
    label: card.label.trim(),
    full_name: card.name.trim(),
    job_title: card.role.trim(),
    company: card.company.trim(),
    bio: card.bio.trim(),
    theme_color: card.theme.toUpperCase(),
    profile_image_url: card.photo,
    company_logo_url: card.companyLogo,
    cover_image_url: card.coverPhoto,
    show_company_details: card.showCompanyDetails ?? true,
    status,
    updated_at: new Date().toISOString(),
  };
}

export function methodsForUpsert(cardId: string, methods: LibraryMethod[]) {
  return methods.filter((method) => method.type && method.value.trim()).map((method, sortOrder) => ({
    card_id: cardId,
    method_type: method.type,
    value: method.value.trim(),
    label: method.label.trim(),
    sort_order: sortOrder,
  }));
}

export function cardMatchesLocal(server: LibraryCard, local: LibraryCard) {
  return server.id === local.id || server.slug === local.slug;
}
