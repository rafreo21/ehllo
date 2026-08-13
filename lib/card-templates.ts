import type { LibraryCard, LibraryMethod } from "./card-library";
import type { CardTemplate } from "./workspace/types";

export function buildCardFromTemplate(
  template: CardTemplate,
  seed: { memberName?: string; memberRole?: string; memberEmail?: string; label?: string } = {},
  identity: { id: string; slug: string; createdAt: string; updatedAt: string },
): LibraryCard {
  const methods: LibraryMethod[] = template.defaultMethods
    .filter((method) => method.type && method.value.trim())
    .map((method, index) => ({
      id: `${method.type}-${index}`,
      type: method.type,
      value: method.type === "email" && seed.memberEmail ? seed.memberEmail : method.value,
      label: method.label,
    }));

  if (seed.memberEmail && !methods.some((method) => method.type === "email")) {
    methods.unshift({
      id: "email-0",
      type: "email",
      value: seed.memberEmail,
      label: "Work",
    });
  }

  return {
    id: identity.id,
    slug: identity.slug,
    label: seed.label || template.name,
    name: seed.memberName || "",
    role: seed.memberRole || "",
    company: template.company,
    bio: template.bioTemplate,
    theme: template.theme,
    photo: "",
    companyLogo: template.companyLogo,
    coverPhoto: template.coverPhoto,
    methods,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
  };
}

export function applyCardTemplate(
  template: CardTemplate,
  seed: { memberName?: string; memberRole?: string; memberEmail?: string; label?: string } = {},
): LibraryCard {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  return buildCardFromTemplate(template, seed, {
    id,
    slug: `card-${id.replaceAll("-", "").slice(0, 16)}`,
    createdAt: now,
    updatedAt: now,
  });
}

export function defaultTeamTemplateSeed(companyName: string): Omit<CardTemplate, "id" | "createdAt" | "updatedAt"> {
  return {
    name: `${companyName} card`,
    company: companyName,
    theme: "#9FE870",
    companyLogo: "",
    coverPhoto: "",
    bioTemplate: `Connect with ${companyName} through ehllo.`,
    defaultMethods: [
      { type: "website", value: "https://example.com", label: "Company website" },
    ],
  };
}
