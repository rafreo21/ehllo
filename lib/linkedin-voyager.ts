/**
 * LinkedIn Voyager API response parsing.
 * Inspired by open-linkedin-api: https://github.com/EseToni/open-linkedin-api
 */

import { parseHeadline } from "./linkedin-page-capture.ts";

export type LinkedInVoyagerProfile = {
  firstName: string;
  lastName: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  companyWebsite: string;
  personalWebsite: string;
  publicId: string;
  urnId: string;
};

export function parseLinkedInPublicId(url: string) {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match?.[1]?.replace(/\/+$/, "") ?? "";
}

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function urnIdFromEntityUrn(urn: unknown) {
  const value = clean(urn);
  if (!value) return "";
  return value.split(":").pop() ?? "";
}

function isCurrentPosition(item: Record<string, unknown>) {
  const timePeriod = item.timePeriod as { endDate?: { year?: number } | null } | undefined;
  if (!timePeriod?.endDate) return true;
  const year = timePeriod.endDate.year;
  return year === undefined || year === 0;
}

function companyFromPosition(item: Record<string, unknown>) {
  const direct = clean(item.companyName);
  if (direct) return direct;
  const company = item.company as Record<string, unknown> | undefined;
  const miniCompany = company?.miniCompany as Record<string, unknown> | undefined;
  return clean(miniCompany?.name) || clean(company?.name);
}

export function parseProfileViewResponse(data: Record<string, unknown> | null | undefined): Partial<LinkedInVoyagerProfile> {
  if (!data || (typeof data.status === "number" && data.status !== 200)) return {};

  const profile = data.profile as Record<string, unknown> | undefined;
  if (!profile) return {};

  const miniProfile = profile.miniProfile as Record<string, unknown> | undefined;
  const firstName = clean(profile.firstName) || clean(miniProfile?.firstName);
  const lastName = clean(profile.lastName) || clean(miniProfile?.lastName);
  const publicId = clean(miniProfile?.publicIdentifier);
  const urnId = urnIdFromEntityUrn(profile.entityUrn || miniProfile?.entityUrn);

  const positionView = data.positionView as { elements?: Record<string, unknown>[] } | undefined;
  const current = (positionView?.elements ?? []).find((item) => isCurrentPosition(item))
    ?? positionView?.elements?.[0];

  return {
    firstName,
    lastName,
    publicId,
    urnId,
    role: clean(current?.title),
    company: current ? companyFromPosition(current) : "",
  };
}

function websiteUrl(item: Record<string, unknown>) {
  return clean(item.url);
}

function websiteLabel(item: Record<string, unknown>) {
  const type = item.type as Record<string, unknown> | undefined;
  if (!type) return "";
  const standard = type["com.linkedin.voyager.identity.profile.StandardWebsite"] as Record<string, unknown> | undefined;
  if (standard?.category) return clean(standard.category);
  const custom = type["com.linkedin.voyager.identity.profile.CustomWebsite"] as Record<string, unknown> | undefined;
  if (custom?.label) return clean(custom.label);
  return "";
}

export function parseContactInfoResponse(data: Record<string, unknown> | null | undefined): Partial<LinkedInVoyagerProfile> {
  if (!data) return {};

  const phoneNumbers = data.phoneNumbers as Array<{ number?: string }> | undefined;
  const phone = clean(phoneNumbers?.[0]?.number);

  let companyWebsite = "";
  let personalWebsite = "";
  for (const item of (data.websites as Record<string, unknown>[] | undefined) ?? []) {
    const url = websiteUrl(item);
    if (!url) continue;
    const label = websiteLabel(item).toLowerCase();
    if (!personalWebsite && /portfolio|personal|blog|other|website/.test(label)) personalWebsite = url;
    if (!companyWebsite && /company|employer|organization/.test(label)) companyWebsite = url;
    if (!personalWebsite && !companyWebsite) personalWebsite = url;
  }

  return {
    email: clean(data.emailAddress).toLowerCase(),
    phone,
    companyWebsite,
    personalWebsite,
  };
}

function parseGraphqlExperienceItem(item: Record<string, unknown>, isGroupItem = false) {
  const component = item.components as { entityComponent?: Record<string, unknown> } | undefined;
  const entity = component?.entityComponent;
  if (!entity) return null;

  const title = clean((entity.titleV2 as { text?: { text?: string } } | undefined)?.text?.text);
  if (!title) return null;

  const subtitle = clean((entity.subtitle as { text?: string } | undefined)?.text);
  const company = subtitle ? subtitle.split(" · ")[0]?.trim() ?? "" : "";
  const caption = clean((entity.caption as { text?: string } | undefined)?.text);
  const employmentType = subtitle.includes(" · ") ? subtitle.split(" · ").slice(1).join(" · ").trim() : "";

  return {
    role: title,
    company: isGroupItem ? "" : company,
    employmentType: isGroupItem ? company : employmentType,
    isCurrent: /present/i.test(caption) || !caption.includes("-"),
  };
}

export function parseExperienceGraphqlResponse(data: Record<string, unknown> | null | undefined) {
  const included = (data?.included as Record<string, unknown>[] | undefined) ?? [];
  const parsedItems: Array<{ role: string; company: string; isCurrent: boolean }> = [];

  for (const block of included) {
    const elements = (block.components as { elements?: Record<string, unknown>[] } | undefined)?.elements ?? [];
    for (const item of elements) {
      const parsed = parseGraphqlExperienceItem(item);
      if (!parsed) continue;
      parsedItems.push({
        role: parsed.role,
        company: parsed.company || parsed.employmentType,
        isCurrent: parsed.isCurrent,
      });
    }
  }

  const current = parsedItems.find((item) => item.isCurrent) ?? parsedItems[0];
  if (!current) return { role: "", company: "" };
  return { role: current.role, company: current.company };
}

export function parseDashTopCardResponse(data: Record<string, unknown> | null | undefined) {
  const included = (data?.included as Record<string, unknown>[] | undefined) ?? [];
  for (const item of included) {
    const headline = clean(item.headline)
      || clean((item.multiLocaleHeadline as Record<string, string> | undefined)?.en_US);
    if (!headline) continue;
    const { role, company } = parseHeadline(headline);
    return {
      firstName: clean(item.firstName) || clean((item.multiLocaleFirstName as Record<string, string> | undefined)?.en_US),
      lastName: clean(item.lastName) || clean((item.multiLocaleLastName as Record<string, string> | undefined)?.en_US),
      urnId: urnIdFromEntityUrn(item.entityUrn),
      role,
      company,
    };
  }
  return {};
}

type EmbeddedSnapshot = {
  firstName: string;
  lastName: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  urnId: string;
};

function walkEmbeddedSnapshot(value: unknown, out: EmbeddedSnapshot) {
  if (!value || typeof value !== "object") return;

  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.emailAddress === "string" && !out.email) out.email = record.emailAddress.toLowerCase();
    if (Array.isArray(record.phoneNumbers) && !out.phone) {
      out.phone = clean((record.phoneNumbers[0] as { number?: string } | undefined)?.number);
    }
    if (typeof record.headline === "string" && !out.role) {
      const parsed = parseHeadline(record.headline);
      out.role = parsed.role;
      out.company = parsed.company;
    }
    if (typeof record.firstName === "string" && !out.firstName) out.firstName = clean(record.firstName);
    if (typeof record.lastName === "string" && !out.lastName) out.lastName = clean(record.lastName);
    if (typeof record.entityUrn === "string" && !out.urnId) out.urnId = urnIdFromEntityUrn(record.entityUrn);

    const positionView = record.positionView as { elements?: Record<string, unknown>[] } | undefined;
    if (positionView?.elements?.length && !out.role) {
      const current = positionView.elements.find((item) => isCurrentPosition(item)) ?? positionView.elements[0];
      out.role = clean(current?.title);
      out.company = companyFromPosition(current ?? {});
    }
  }

  if (Array.isArray(value)) {
    value.forEach((item) => walkEmbeddedSnapshot(item, out));
    return;
  }

  Object.values(value as Record<string, unknown>).forEach((item) => walkEmbeddedSnapshot(item, out));
}

export function parseEmbeddedFromHtml(html: string): Partial<LinkedInVoyagerProfile> {
  const out: EmbeddedSnapshot = {
    firstName: "",
    lastName: "",
    role: "",
    company: "",
    email: "",
    phone: "",
    urnId: "",
  };

  const codeBlocks = html.match(/<code[^>]*id="[^"]*bpr-guid[^"]*"[^>]*>[\s\S]*?<\/code>/gi) ?? [];
  for (const block of codeBlocks) {
    const text = block.replace(/^[\s\S]*?>/, "").replace(/<\/code>[\s\S]*$/, "").trim();
    if (!text.startsWith("{")) continue;
    try {
      walkEmbeddedSnapshot(JSON.parse(text), out);
    } catch {
      /* ignore malformed chunks */
    }
  }

  if (!out.email) {
    const match = html.match(/"emailAddress"\s*:\s*"([^"]+)"/i);
    if (match) out.email = match[1].toLowerCase();
  }
  if (!out.role) {
    const match = html.match(/"title"\s*:\s*"([^"]+)"/i);
    if (match) {
      const parsed = parseHeadline(match[1]);
      if (parsed.role) out.role = parsed.role;
    }
  }
  if (!out.company) {
    const match = html.match(/"companyName"\s*:\s*"([^"]+)"/i);
    if (match) out.company = match[1];
  }

  return out;
}

export function parseExperienceSectionTextFromHtml(html: string) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\n+/g, "\n");

  const lines = text.split("\n").map((line) => clean(line)).filter(Boolean);
  const experienceIndex = lines.findIndex((line) => /^experience$/i.test(line));
  const startIndex = experienceIndex >= 0 ? experienceIndex + 1 : 0;
  const role = lines.slice(startIndex).find((line) => line.length <= 80 && !/^show all$/i.test(line)) ?? "";
  if (!role) return { role: "", company: "" };

  const roleIndex = lines.indexOf(role, startIndex);
  const companyLine = lines.slice(roleIndex + 1).find((line) => line.includes("·")) ?? "";
  return {
    role,
    company: companyLine ? companyLine.split(" · ")[0]?.trim() ?? "" : "",
  };
}

export const EXPERIENCE_DETAILS_HTML_FIXTURE = `
<html><body>
Experience
Product Designer
Nexleaf Analytics · Full-time
<code id="datalet-bpr-guid-1">{"positionView":{"elements":[{"title":"Product Designer","companyName":"Nexleaf Analytics"}]}}</code>
</body></html>
`.trim();

export function parseEmbeddedLinkedInSnapshot(text: string): Partial<LinkedInVoyagerProfile> {
  const out: EmbeddedSnapshot = {
    firstName: "",
    lastName: "",
    role: "",
    company: "",
    email: "",
    phone: "",
    urnId: "",
  };

  try {
    walkEmbeddedSnapshot(JSON.parse(text), out);
  } catch {
    const emailMatch = text.match(/"emailAddress"\s*:\s*"([^"]+)"/i);
    if (emailMatch) out.email = emailMatch[1].toLowerCase();
    const phoneMatch = text.match(/"phoneNumbers"\s*:\s*\[\s*\{[^}]*"number"\s*:\s*"([^"]+)"/i);
    if (phoneMatch) out.phone = phoneMatch[1];
    const headlineMatch = text.match(/"headline"\s*:\s*"([^"]+)"/i);
    if (headlineMatch) {
      const parsed = parseHeadline(headlineMatch[1]);
      out.role = parsed.role;
      out.company = parsed.company;
    }
  }

  return out;
}

export function mergeVoyagerIntoProfile<T extends Record<string, string | undefined>>(
  base: T,
  voyager: Partial<LinkedInVoyagerProfile>,
): T {
  const merged: Record<string, string | undefined> = { ...base };
  (["firstName", "lastName", "role", "company", "email", "phone", "companyWebsite", "personalWebsite"] as const).forEach((field) => {
    const value = clean(voyager[field]);
    if (value) merged[field] = value;
  });
  return merged as T;
}

export const PROFILE_VIEW_FIXTURE = {
  profile: {
    firstName: "Raphael",
    lastName: "Okojie",
    entityUrn: "urn:li:fs_profile:ACoAAB123",
    miniProfile: {
      firstName: "Raphael",
      lastName: "Okojie",
      publicIdentifier: "rafreo",
      entityUrn: "urn:li:fs_miniProfile:ACoAAB123",
    },
  },
  positionView: {
    elements: [
      {
        title: "Product Designer",
        companyName: "Nexleaf Analytics",
        timePeriod: {
          startDate: { year: 2025, month: 1 },
          endDate: null,
        },
      },
      {
        title: "Senior Product Designer",
        companyName: "Andela",
        timePeriod: {
          startDate: { year: 2022, month: 10 },
          endDate: { year: 2025, month: 5 },
        },
      },
    ],
  },
} as const;

export const CONTACT_INFO_FIXTURE = {
  emailAddress: "rafreo21@gmail.com",
  phoneNumbers: [{ number: "+447473177720", type: "MOBILE" }],
  websites: [],
} as const;

export const DASH_TOP_CARD_FIXTURE = {
  included: [
    {
      firstName: "Raphael",
      lastName: "Okojie",
      headline: "Product Designer at Nexleaf Analytics",
      entityUrn: "urn:li:fsd_profile:ACoAAB123",
    },
  ],
} as const;

export const EXPERIENCE_GRAPHQL_FIXTURE = {
  included: [
    {
      components: {
        elements: [
          {
            components: {
              entityComponent: {
                titleV2: { text: { text: "Product Designer" } },
                subtitle: { text: "Nexleaf Analytics · Full-time" },
                caption: { text: "Jan 2025 - Present · 1 yr 7 mos" },
              },
            },
          },
        ],
      },
    },
  ],
} as const;
