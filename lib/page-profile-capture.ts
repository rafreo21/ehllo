import { capturedProfileFullName, normalizeLinkedInProfileName } from "./contacts.ts";
import {
  buildLinkedInCaptureContext,
  headlineFromPageText,
  mergeLinkedInRoleCompany,
  parseContactInfoFromText,
  parseExperienceFromText,
  parseHeadline,
} from "./linkedin-page-capture.ts";

export type CapturedProfile = {
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  workEmail?: string;
  personalEmail?: string;
  phone: string;
  company: string;
  role: string;
  companyWebsite: string;
  personalWebsite: string;
  linkedinUrl: string;
  sourceUrl: string;
  source: "linkedin" | "website" | "extension";
  context?: string;
};

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(value: string) {
  const trimmed = clean(value);
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed.split("?")[0]?.replace(/\/+$/, "") ?? trimmed;
  return `https://${trimmed.replace(/^\/\//, "")}`;
}

export { parseHeadline } from "./linkedin-page-capture.ts";

function readMetaContent(
  documentLike: { querySelector: (selector: string) => { getAttribute?: (name: string) => string | null } | null },
  key: string,
) {
  const node = documentLike.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
  return clean(node?.getAttribute?.("content"));
}

function headlineFromTitle(title: string) {
  const titleName = title.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();
  const dashParts = titleName.split(/\s+[-–-]\s+/);
  if (dashParts.length > 1) return dashParts.slice(1).join(" - ");
  return "";
}

function headlineFromOpenGraph(documentLike: {
  querySelector: (selector: string) => { getAttribute?: (name: string) => string | null } | null;
}) {
  const ogTitle = readMetaContent(documentLike, "og:title").replace(/\s*\|\s*LinkedIn\s*$/i, "");
  if (ogTitle) {
    const dashParts = ogTitle.split(/\s+[-–-]\s+/);
    if (dashParts.length > 1) return dashParts.slice(1).join(" - ");
  }
  return readMetaContent(documentLike, "og:description");
}

function headlineFromDom(documentLike: {
  querySelector: (selector: string) => { textContent: string | null } | null;
}) {
  const selectors = [
    ".text-body-medium",
    "[data-generated-suggestion-target]",
    "div[data-view-name=\"profile-card\"] h2",
    ".pv-text-details__left-panel h2",
    ".top-card-layout__headline",
  ];
  for (const selector of selectors) {
    const value = clean(documentLike.querySelector(selector)?.textContent);
    if (value && value.length <= 120) return value;
  }
  return "";
}

function extractLinks(documentLike: {
  querySelectorAll: (selector: string) => ArrayLike<{ textContent: string | null; getAttribute?: (name: string) => string | null }>;
}) {
  let email = "";
  let phone = "";
  let companyWebsite = "";
  let personalWebsite = "";

  for (const node of documentLike.querySelectorAll("a[href^='mailto:'], a[href^='tel:'], a[href^='http']")) {
    const href = node.getAttribute?.("href") ?? "";
    if (!email && href.startsWith("mailto:")) email = clean(href.replace(/^mailto:/i, "").split("?")[0]);
    if (!phone && href.startsWith("tel:")) phone = clean(href.replace(/^tel:/i, "").split("?")[0]);
    if (!href.startsWith("http") || /linkedin\.com/i.test(href)) continue;
    const label = clean(node.textContent).toLowerCase();
    const url = normalizeUrl(href);
    if (!personalWebsite && /portfolio|website|blog|site|personal/i.test(label)) personalWebsite = url;
    if (!companyWebsite && /company|employer|organization/i.test(label)) companyWebsite = url;
  }

  return { email, phone, companyWebsite, personalWebsite };
}

export function captureFromLinkedInDocument(documentLike: {
  title: string;
  location: { href: string };
  body?: { innerText?: string | null };
  querySelector: (selector: string) => { textContent: string | null; getAttribute?: (name: string) => string | null } | null;
  querySelectorAll: (selector: string) => ArrayLike<{ textContent: string | null; getAttribute?: (name: string) => string | null }>;
}) {
  const pageText = documentLike.body?.innerText ?? "";
  const linkedinUrl = normalizeUrl(documentLike.location.href.split("?")[0] ?? "");
  const titleName = documentLike.title.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();
  const h1 = clean(documentLike.querySelector("h1")?.textContent);
  const ogTitle = readMetaContent(documentLike, "og:title").replace(/\s*\|\s*LinkedIn\s*$/i, "");
  const fullName = normalizeLinkedInProfileName(
    h1 || ogTitle.split(/\s+[-–-]\s+/)[0] || titleName.split(/\s+[-–-]\s+/)[0] || titleName.split("|")[0] || "",
  );

  const experience = parseExperienceFromText(pageText);
  const { role, company } = mergeLinkedInRoleCompany(experience);

  const links = extractLinks(documentLike);
  const contact = parseContactInfoFromText(pageText);
  const email = links.email || contact.email;
  const phone = links.phone || contact.phone;

  const profile = {
    fullName,
    email,
    phone,
    company,
    role,
    companyWebsite: links.companyWebsite,
    personalWebsite: links.personalWebsite,
    linkedinUrl,
    sourceUrl: linkedinUrl,
    source: "linkedin" as const,
    context: buildLinkedInCaptureContext({ role, company, email, phone, linkedinUrl }),
  };

  return profile satisfies CapturedProfile;
}

export function captureFromGenericDocument(documentLike: {
  title: string;
  location: { href: string };
  querySelector: (selector: string) => { textContent: string | null } | null;
}) {
  const sourceUrl = normalizeUrl(documentLike.location.href);
  const title = clean(documentLike.title);
  const h1 = clean(documentLike.querySelector("h1")?.textContent);
  return {
    fullName: normalizeLinkedInProfileName(h1 || title.split("|")[0] || title),
    email: "",
    phone: "",
    company: "",
    role: "",
    companyWebsite: /linkedin\.com/i.test(sourceUrl) ? "" : sourceUrl,
    personalWebsite: "",
    linkedinUrl: /linkedin\.com\/in\//i.test(sourceUrl) ? sourceUrl : "",
    sourceUrl,
    source: /linkedin\.com/i.test(sourceUrl) ? "linkedin" as const : "website" as const,
  } satisfies CapturedProfile;
}

export function encodeCapturePayload(profile: Partial<CapturedProfile>) {
  const json = JSON.stringify(profile);
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  return Buffer.from(json, "utf8").toString("base64url");
}
