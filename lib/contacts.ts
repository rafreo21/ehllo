export type ContactSource = "csv" | "vcard" | "manual" | "exchange" | "badge" | "linkedin" | "scan" | "extension";

export type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  linkedinUrl?: string;
  whatsappUrl?: string;
  instagramUrl?: string;
  xUrl?: string;
  tiktokUrl?: string;
  company: string;
  role: string;
  companyWebsite?: string;
  personalWebsite?: string;
  context: string;
  source?: ContactSource;
  exchangeId?: string;
  campaignId?: string;
  legacyId?: string;
  updatedAt?: string;
};

export const CONTACTS_STORAGE_KEY = "aftermeet-contacts-v1";

export function readContacts(): Contact[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CONTACTS_STORAGE_KEY) || "[]") as Contact[];
  } catch {
    return [];
  }
}

export function writeContacts(contacts: Contact[]) {
  localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizePersonName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findContactById(contactId: string) {
  return readContacts().find((contact) => contact.id === contactId) ?? null;
}

export function findContactByExchangeId(exchangeId: string) {
  if (!exchangeId) return null;
  return readContacts().find((contact) => contact.exchangeId === exchangeId || contact.id === `exchange-${exchangeId}`) ?? null;
}

export function findContactByCardSlug(slug: string) {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  return readContacts().find((contact) => contact.id === `card-${normalized}`) ?? null;
}

export function findContactByEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return readContacts().find((contact) => normalizeEmail(contact.email) === normalized) ?? null;
}

export function findContactByPersonName(firstName: string, lastName: string) {
  const key = normalizePersonName(firstName, lastName);
  if (!key || key === "guest") return null;
  return readContacts().find((contact) => normalizePersonName(contact.firstName, contact.lastName) === key) ?? null;
}

export function contactDisplayName(contact: Pick<Contact, "firstName" | "lastName">) {
  return `${contact.firstName} ${contact.lastName}`.trim();
}

export function normalizeLinkedInProfileName(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\|\s*LinkedIn\s*$/i, "")
    .replace(/\s*[-–—]\s*LinkedIn\s*$/i, "")
    .replace(/\s*·\s*LinkedIn\s*$/i, "");
}

export function splitFullName(fullName: string) {
  const normalized = normalizeLinkedInProfileName(fullName);
  const parts = normalized.split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "Guest", lastName: parts.slice(1).join(" ") };
}

export function capturedProfileFullName(profile: {
  fullName?: string;
  firstName?: string;
  lastName?: string;
}) {
  const direct = normalizeLinkedInProfileName(profile.fullName ?? "");
  if (direct) return direct;
  return normalizeLinkedInProfileName([profile.firstName, profile.lastName].filter(Boolean).join(" "));
}

export function contactFromExchange(exchange: {
  id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_phone?: string;
  visitor_company: string;
  visitor_role: string;
  note: string;
}, cardLabel: string): Contact {
  const { firstName, lastName } = splitFullName(exchange.visitor_name);
  return {
    id: `exchange-${exchange.id}`,
    firstName,
    lastName,
    email: exchange.visitor_email,
    phone: exchange.visitor_phone || undefined,
    company: exchange.visitor_company,
    role: exchange.visitor_role,
    context: exchange.note || `Shared back from ${cardLabel}.`,
    source: "exchange",
    exchangeId: exchange.id,
  };
}

export function contactFromPublicCard(
  card: {
    slug: string;
    fullName: string;
    role?: string;
    company?: string;
    email?: string;
    phone?: string;
    linkedinUrl?: string;
    whatsappUrl?: string;
    instagramUrl?: string;
    xUrl?: string;
    tiktokUrl?: string;
  },
  source: Extract<ContactSource, "badge" | "scan"> = "scan",
): Contact {
  const { firstName, lastName } = splitFullName(card.fullName);
  return {
    id: `card-${card.slug}`,
    firstName,
    lastName,
    email: card.email ?? "",
    phone: card.phone || undefined,
    linkedinUrl: card.linkedinUrl || undefined,
    whatsappUrl: card.whatsappUrl || undefined,
    instagramUrl: card.instagramUrl || undefined,
    xUrl: card.xUrl || undefined,
    tiktokUrl: card.tiktokUrl || undefined,
    company: card.company ?? "",
    role: card.role ?? "",
    context: `Met via ${source === "badge" ? "badge scan" : "QR scan"}.`,
    source,
  };
}
