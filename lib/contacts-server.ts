import type { Contact, ContactSource } from "./contacts";

export type ContactRow = {
  id: string;
  workspace_id: string;
  created_by_user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  linkedin_url: string;
  whatsapp_url: string;
  instagram_url: string;
  x_url: string;
  tiktok_url: string;
  company: string;
  role: string;
  company_website: string;
  personal_website: string;
  context: string;
  source: ContactSource | null;
  exchange_id: string | null;
  campaign_id: string | null;
  legacy_id: string | null;
  created_at: string;
  updated_at: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isContactUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function contactFromRow(row: ContactRow): Contact {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone || undefined,
    linkedinUrl: row.linkedin_url || undefined,
    whatsappUrl: row.whatsapp_url || undefined,
    instagramUrl: row.instagram_url || undefined,
    xUrl: row.x_url || undefined,
    tiktokUrl: row.tiktok_url || undefined,
    company: row.company,
    role: row.role,
    companyWebsite: row.company_website || undefined,
    personalWebsite: row.personal_website || undefined,
    context: row.context,
    source: row.source ?? undefined,
    exchangeId: row.exchange_id ?? undefined,
    campaignId: row.campaign_id ?? undefined,
    legacyId: row.legacy_id ?? undefined,
    updatedAt: row.updated_at,
  };
}

export function contactToRow(
  contact: Contact,
  workspaceId: string,
  userId: string,
  existingId?: string,
) {
  const useExistingId = existingId || (isContactUuid(contact.id) ? contact.id : crypto.randomUUID());
  return {
    id: useExistingId,
    workspace_id: workspaceId,
    created_by_user_id: userId,
    first_name: contact.firstName.trim(),
    last_name: contact.lastName.trim(),
    email: contact.email.trim(),
    phone: contact.phone?.trim() ?? "",
    linkedin_url: contact.linkedinUrl?.trim() ?? "",
    whatsapp_url: contact.whatsappUrl?.trim() ?? "",
    instagram_url: contact.instagramUrl?.trim() ?? "",
    x_url: contact.xUrl?.trim() ?? "",
    tiktok_url: contact.tiktokUrl?.trim() ?? "",
    company: contact.company.trim(),
    role: contact.role.trim(),
    company_website: contact.companyWebsite?.trim() ?? "",
    personal_website: contact.personalWebsite?.trim() ?? "",
    context: contact.context.trim(),
    source: contact.source ?? null,
    exchange_id: contact.exchangeId ?? null,
    campaign_id: contact.campaignId ?? null,
    legacy_id: isContactUuid(contact.id) ? null : contact.id,
    updated_at: new Date().toISOString(),
  };
}

export function contactMatchesLocal(server: Contact, local: Contact) {
  if (server.id === local.id) return true;
  if (local.exchangeId && server.exchangeId === local.exchangeId) return true;
  return false;
}
