import { splitFullName } from "./contacts.ts";
import { sanitizePhoneNumber } from "./contact-fields.ts";

export type EnrichmentField = "email" | "phone";
export type EnrichmentConfidence = "verified" | "likely" | "none";
export type EnrichmentStepStatus = "pending" | "running" | "found" | "miss" | "skipped";

export type EnrichmentProvider = {
  id: string;
  label: string;
  description: string;
};

export type EnrichmentStep = {
  id: string;
  label: string;
  status: EnrichmentStepStatus;
  value?: string;
  detail?: string;
};

export type EnrichmentInput = {
  fullName: string;
  company: string;
  linkedinUrl?: string;
  field: EnrichmentField;
  seedEmail?: string;
  seedWorkEmail?: string;
  seedPersonalEmail?: string;
  seedPhone?: string;
};

export type EnrichmentResult = {
  field: EnrichmentField;
  value: string;
  confidence: EnrichmentConfidence;
  provider: string;
  steps: EnrichmentStep[];
};

/** Surfe-style provider order - verified sources only, no pattern guessing. */
export const WORK_EMAIL_PROVIDERS: EnrichmentProvider[] = [
  { id: "linkedin", label: "LinkedIn", description: "Work email visible on profile or Contact info" },
  { id: "hunter", label: "Hunter.io", description: "Verified work email lookup" },
  { id: "findymail", label: "Findymail", description: "B2B email database" },
  { id: "rocketreach", label: "RocketReach", description: "Professional contact database" },
  { id: "apollo", label: "Apollo.io", description: "Sales intelligence database" },
];

export const PHONE_PROVIDERS: EnrichmentProvider[] = [
  { id: "linkedin", label: "LinkedIn", description: "Phone visible on profile or Contact info" },
  { id: "prospeo", label: "Prospeo", description: "Mobile number lookup" },
  { id: "upcell", label: "Upcell", description: "Direct dial database" },
  { id: "contactout", label: "ContactOut", description: "Phone enrichment database" },
];

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function guessCompanyDomain(company: string) {
  const withoutParens = company.replace(/\([^)]*\)/g, " ").replace(/\b(?:formerly|previously)\b.+/i, "");
  const stripped = withoutParens
    .replace(/\b(?:inc|llc|ltd|limited|corp|corporation|co|company|group|plc)\.?\b/gi, " ")
    .trim();

  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(stripped)) {
    return stripped.toLowerCase();
  }

  const slug = stripped.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 48);
  return slug ? `${slug}.com` : "";
}

export function guessWorkEmail(fullName: string, company: string) {
  const domain = guessCompanyDomain(company);
  if (!domain) return "";

  const { firstName, lastName } = splitFullName(fullName);
  const first = firstName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const last = lastName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!first) return "";

  const localParts = [
    last ? `${first}.${last}` : "",
    last ? `${first}${last}` : "",
    last ? `${first[0]}${last}` : "",
    first,
  ].filter(Boolean);

  return `${localParts[0]}@${domain}`;
}

function linkedInWorkEmailStep(seedWorkEmail: string): EnrichmentStep {
  const value = clean(seedWorkEmail).toLowerCase();
  return {
    id: "linkedin",
    label: "LinkedIn",
    status: value ? "found" : "miss",
    value: value || undefined,
    detail: value
      ? "Work email visible on LinkedIn"
      : "No work email visible for your account on LinkedIn",
  };
}

function linkedInPhoneStep(seedPhone: string): EnrichmentStep {
  const value = sanitizePhoneNumber(seedPhone);
  return {
    id: "linkedin",
    label: "LinkedIn",
    status: value ? "found" : "miss",
    value: value || undefined,
    detail: value
      ? "Phone visible on LinkedIn Contact info"
      : "No phone visible for your account on LinkedIn",
  };
}

async function hunterStep(
  fullName: string,
  company: string,
  apiKey: string | undefined,
): Promise<EnrichmentStep> {
  if (!apiKey) {
    return {
      id: "hunter",
      label: "Hunter.io",
      status: "skipped",
      detail: "Add HUNTER_API_KEY to enable verified work emails",
    };
  }

  const domain = guessCompanyDomain(company);
  const { firstName, lastName } = splitFullName(fullName);
  if (!domain || !firstName) {
    return {
      id: "hunter",
      label: "Hunter.io",
      status: "miss",
      detail: "Need full name and company to search Hunter",
    };
  }

  const url = new URL("https://api.hunter.io/v2/email-finder");
  url.searchParams.set("domain", domain);
  url.searchParams.set("first_name", firstName);
  if (lastName) url.searchParams.set("last_name", lastName);
  url.searchParams.set("api_key", apiKey);

  try {
    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      return {
        id: "hunter",
        label: "Hunter.io",
        status: "miss",
        detail: `Hunter returned ${response.status}`,
      };
    }

    const payload = await response.json() as {
      data?: { email?: string | null; score?: number | null };
    };
    const email = clean(payload.data?.email ?? "").toLowerCase();
    if (!email) {
      return {
        id: "hunter",
        label: "Hunter.io",
        status: "miss",
        detail: "No verified email in Hunter for this person",
      };
    }

    const score = payload.data?.score ?? 0;
    return {
      id: "hunter",
      label: "Hunter.io",
      status: "found",
      value: email,
      detail: score ? `Verified · confidence ${score}` : "Verified work email",
    };
  } catch {
    return {
      id: "hunter",
      label: "Hunter.io",
      status: "miss",
      detail: "Could not reach Hunter.io",
    };
  }
}

function skippedBecauseFound(provider: EnrichmentProvider): EnrichmentStep {
  return {
    id: provider.id,
    label: provider.label,
    status: "skipped",
    detail: "Skipped - verified match already found",
  };
}

function placeholderStep(provider: EnrichmentProvider): EnrichmentStep {
  return {
    id: provider.id,
    label: provider.label,
    status: "skipped",
    detail: `${provider.description} · coming soon`,
  };
}

function stepConfidence(step: EnrichmentStep): EnrichmentConfidence {
  if (step.status !== "found" || !step.value) return "none";
  if (step.id === "hunter") return "verified";
  if (step.id === "linkedin") return "likely";
  return "none";
}

function buildResult(
  field: EnrichmentField,
  steps: EnrichmentStep[],
  winningStep: EnrichmentStep | null,
): EnrichmentResult {
  if (!winningStep?.value) {
    return {
      field,
      value: "",
      confidence: "none",
      provider: "",
      steps,
    };
  }

  return {
    field,
    value: winningStep.value,
    confidence: stepConfidence(winningStep),
    provider: winningStep.id,
    steps,
  };
}

export function isFillableEnrichmentResult(result: EnrichmentResult) {
  return Boolean(result.value) && result.confidence !== "none";
}

export async function enrichContactField(
  input: EnrichmentInput,
  options: { hunterApiKey?: string } = {},
): Promise<EnrichmentResult> {
  const fullName = clean(input.fullName);
  const company = clean(input.company);
  const seedWorkEmail = clean(input.seedWorkEmail ?? "");
  const seedPhone = clean(input.seedPhone ?? "");

  if (input.field === "email") {
    const steps: EnrichmentStep[] = [];
    const providers = WORK_EMAIL_PROVIDERS;

    const linkedin = linkedInWorkEmailStep(seedWorkEmail);
    steps.push(linkedin);
    if (linkedin.status === "found" && linkedin.value) {
      steps.push(...providers.slice(1).map(skippedBecauseFound));
      return buildResult("email", steps, linkedin);
    }

    const hunter = await hunterStep(fullName, company, options.hunterApiKey);
    steps.push(hunter);
    if (hunter.status === "found" && hunter.value) {
      steps.push(...providers.slice(2).map(skippedBecauseFound));
      return buildResult("email", steps, hunter);
    }

    for (const provider of providers.slice(2)) {
      steps.push(placeholderStep(provider));
    }

    return buildResult("email", steps, null);
  }

  const steps: EnrichmentStep[] = [];
  const providers = PHONE_PROVIDERS;

  const linkedin = linkedInPhoneStep(seedPhone);
  steps.push(linkedin);
  if (linkedin.status === "found" && linkedin.value) {
    steps.push(...providers.slice(1).map(skippedBecauseFound));
    return buildResult("phone", steps, linkedin);
  }

  for (const provider of providers.slice(1)) {
    steps.push(placeholderStep(provider));
  }

  return buildResult("phone", steps, null);
}

export function enrichmentSourceLabel(provider: string) {
  switch (provider) {
    case "linkedin": return "LinkedIn";
    case "hunter": return "Hunter.io";
    case "findymail": return "Findymail";
    case "rocketreach": return "RocketReach";
    case "apollo": return "Apollo.io";
    case "prospeo": return "Prospeo";
    case "upcell": return "Upcell";
    case "contactout": return "ContactOut";
    default: return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "";
  }
}

export function enrichmentConfidenceLabel(confidence: EnrichmentConfidence) {
  switch (confidence) {
    case "verified": return "Verified";
    case "likely": return "From LinkedIn";
    default: return "";
  }
}
