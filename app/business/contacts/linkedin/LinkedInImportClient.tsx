"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { RefreshCw as ArrowsClockwiseIcon } from "react-feather";
import { Save as FloppyDiskIcon } from "react-feather";
import { Linkedin as LinkedinLogoIcon } from "react-feather";
import { Mic as MicrophoneIcon } from "react-feather";
import { BusinessShell } from "../../../components/BusinessShell";
import { StatusMessage } from "../../../components/AsyncState";
import { Button, LinkButton } from "../../../components/Button";
import {
  animateEnrichmentResult,
  ProfileCaptureTable,
  sourceLabelFromEnrichment,
  type ProfileFieldKey,
} from "../../../components/ProfileCaptureTable";
import { TextAreaField } from "../../../components/FormField";
import { capturedProfileFullName, splitFullName, type Contact } from "../../../../lib/contacts";
import { sanitizePhoneNumber } from "../../../../lib/contact-fields";
import type { EnrichmentField, EnrichmentResult, EnrichmentStep } from "../../../../lib/contact-enrichment";
import { isFillableEnrichmentResult } from "../../../../lib/contact-enrichment";
import { resolveAndSaveContact } from "../../../../lib/person-links";
import { normalizeLinkedInUrl, parseLinkedInProfileInput } from "../../../../lib/linkedin-profile";
import type { LinkedInImportInitialState } from "../../../../lib/linkedin-import-state";
import "../../../app/product.css";
import "../../../app/flow.css";

type LinkedInProfileResponse = {
  profile?: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    company?: string;
    linkedinUrl?: string;
    handle?: string;
  };
  source?: "opengraph" | "url_only";
  message?: string;
  error?: string;
};

type FieldSources = Record<ProfileFieldKey, string>;

const emptyProfileFields = {
  fullName: "",
  workEmail: "",
  personalEmail: "",
  phone: "",
  role: "",
  company: "",
};

function initialFieldSources(initial: LinkedInImportInitialState): FieldSources {
  const linkedInSource = initial.isExtensionImport ? "LinkedIn" : initial.form.fullName ? "LinkedIn" : "";
  return {
    fullName: initial.form.fullName ? linkedInSource || "LinkedIn" : "",
    workEmail: initial.form.workEmail ? linkedInSource || "LinkedIn" : "",
    personalEmail: initial.form.personalEmail ? "LinkedIn Contact info" : "",
    phone: initial.form.phone ? "LinkedIn Contact info" : "",
    role: initial.form.role ? linkedInSource || "LinkedIn" : "",
    company: initial.form.company ? linkedInSource || "LinkedIn" : "",
    linkedinUrl: initial.input ? "LinkedIn" : "",
  };
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function LinkedInImportClient({ initial }: { initial: LinkedInImportInitialState }) {
  const [input, setInput] = useState(initial.input);
  const [importSource, setImportSource] = useState<Contact["source"]>(initial.importSource);
  const [form, setForm] = useState({
    ...initial.form,
    fullName: decodeHtmlEntities(initial.form.fullName),
    role: decodeHtmlEntities(initial.form.role),
    company: decodeHtmlEntities(initial.form.company),
  });
  const [fieldSources, setFieldSources] = useState<FieldSources>(() => initialFieldSources(initial));
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState("");
  const [lookupStatus, setLookupStatus] = useState(initial.lookupStatus);
  const [lookupMessage, setLookupMessage] = useState(initial.lookupMessage);
  const [enrichingField, setEnrichingField] = useState<EnrichmentField | null>(null);
  const [enrichmentSteps, setEnrichmentSteps] = useState<EnrichmentStep[]>([]);
  const [enrichError, setEnrichError] = useState("");
  const lookupRequestRef = useRef(0);
  const activeHandleRef = useRef("");
  const extensionImportRef = useRef(initial.isExtensionImport);

  const parsed = useMemo(() => parseLinkedInProfileInput(input), [input]);
  const linkedinUrl = parsed ? normalizeLinkedInUrl(parsed.url) : "";

  function applyVerifiedProfile(payload: LinkedInProfileResponse) {
    if (payload.source !== "opengraph" || !payload.profile) return;
    const fullName = capturedProfileFullName(payload.profile);
    setForm((current) => ({
      ...current,
      fullName: fullName || current.fullName,
      role: payload.profile?.role?.trim() || current.role,
      company: payload.profile?.company?.trim() || current.company,
    }));
    setFieldSources((current) => ({
      ...current,
      fullName: fullName ? "LinkedIn" : current.fullName,
      role: payload.profile?.role?.trim() ? "LinkedIn" : current.role,
      company: payload.profile?.company?.trim() ? "LinkedIn" : current.company,
    }));
  }

  async function loadProfileDetails(url: string, handle: string, requestId: number) {
    setLookupStatus("loading");
    setLookupMessage("Checking LinkedIn for verified public profile details…");
    try {
      const response = await fetch(`/api/linkedin/profile?url=${encodeURIComponent(url)}`);
      const payload = await response.json() as LinkedInProfileResponse;
      if (requestId !== lookupRequestRef.current || activeHandleRef.current !== handle) return;

      if (!response.ok) {
        setLookupStatus("partial");
        setLookupMessage(payload.error || "Could not load profile details. Add what you remember below.");
        return;
      }

      if (payload.source === "opengraph") {
        applyVerifiedProfile(payload);
        setLookupStatus("ready");
      } else {
        setLookupStatus("partial");
      }
      setLookupMessage(payload.message || "Profile link saved. Add what you remember from the conversation.");
      setError("");
    } catch {
      if (requestId !== lookupRequestRef.current || activeHandleRef.current !== handle) return;
      setLookupStatus("partial");
      setLookupMessage("Could not reach LinkedIn. Add name, role, and company from your conversation.");
    }
  }

  useEffect(() => {
    if (!parsed?.url || !parsed.handle) {
      activeHandleRef.current = "";
      if (!extensionImportRef.current) {
        setLookupStatus("idle");
        setLookupMessage("");
      }
      return;
    }

    if (activeHandleRef.current !== parsed.handle) {
      activeHandleRef.current = parsed.handle;
      setSavedId("");
      if (!extensionImportRef.current) {
        setForm((current) => ({
          ...current,
          ...emptyProfileFields,
          context: current.context,
        }));
        setFieldSources((current) => ({
          ...current,
          fullName: "",
          workEmail: "",
          personalEmail: "",
          phone: "",
          role: "",
          company: "",
          linkedinUrl: "LinkedIn",
        }));
      }
    }

    if (extensionImportRef.current) {
      return;
    }

    const requestId = lookupRequestRef.current + 1;
    lookupRequestRef.current = requestId;
    const timeout = window.setTimeout(() => {
      void loadProfileDetails(parsed.url, parsed.handle, requestId);
    }, extensionImportRef.current ? 0 : 450);

    return () => window.clearTimeout(timeout);
  }, [parsed?.url, parsed?.handle]);

  function refreshProfile() {
    if (!parsed?.url || !parsed.handle) {
      setError("Paste a LinkedIn profile URL like linkedin.com/in/username.");
      return;
    }
    extensionImportRef.current = false;
    const requestId = lookupRequestRef.current + 1;
    lookupRequestRef.current = requestId;
    void loadProfileDetails(parsed.url, parsed.handle, requestId);
  }

  function updateField(key: ProfileFieldKey, value: string) {
    if (key === "linkedinUrl") {
      setInput(value);
      setFieldSources((current) => ({ ...current, linkedinUrl: value.trim() ? "Manual" : "" }));
      return;
    }

    setForm((current) => ({ ...current, [key]: key === "phone" ? sanitizePhoneNumber(value) || value : value }));
    setFieldSources((current) => ({
      ...current,
      [key]: value.trim() ? "Manual" : "",
    }));
  }

  async function enrichField(field: EnrichmentField) {
    if (!form.fullName.trim()) {
      setEnrichError("Add a full name before searching for contact details.");
      return;
    }

    setEnrichingField(field);
    setEnrichError("");
    setEnrichmentSteps([]);

    try {
      const response = await fetch("/api/contacts/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          company: form.company,
          linkedinUrl,
          field,
          seedEmail: form.workEmail || form.personalEmail,
          seedWorkEmail: form.workEmail,
          seedPersonalEmail: form.personalEmail,
          seedPhone: form.phone,
        }),
      });
      const payload = await response.json() as EnrichmentResult & { error?: string };
      if (!response.ok) {
        setEnrichError(payload.error || "Could not search contact sources.");
        return;
      }

      const result = await animateEnrichmentResult(payload, setEnrichmentSteps);
      if (isFillableEnrichmentResult(result)) {
        if (field === "email") {
          setForm((current) => ({ ...current, workEmail: result.value }));
          setFieldSources((current) => ({
            ...current,
            workEmail: sourceLabelFromEnrichment(result) || "Enriched",
          }));
        } else {
          setForm((current) => ({ ...current, phone: sanitizePhoneNumber(result.value) || result.value }));
          setFieldSources((current) => ({
            ...current,
            phone: sourceLabelFromEnrichment(result) || "Enriched",
          }));
        }
      } else {
        setEnrichError(`No verified ${field === "email" ? "work email" : "phone"} found across our databases.`);
      }
    } catch {
      setEnrichError("Could not reach enrichment services.");
    } finally {
      setEnrichingField(null);
    }
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!parsed) {
      setError("Paste a LinkedIn profile URL like linkedin.com/in/username.");
      return;
    }
    if (!form.fullName.trim()) {
      setError("Add a full name.");
      return;
    }

    const { firstName, lastName } = splitFullName(form.fullName);
    const contact: Contact = {
      id: `${importSource}-${parsed.handle}`,
      firstName,
      lastName,
      email: form.workEmail.trim() || form.personalEmail.trim(),
      workEmail: form.workEmail.trim() || undefined,
      personalEmail: form.personalEmail.trim() || undefined,
      phone: sanitizePhoneNumber(form.phone) || undefined,
      linkedinUrl,
      company: form.company.trim(),
      role: form.role.trim(),
      context: form.context.trim(),
      source: importSource,
    };
    resolveAndSaveContact(contact);
    setSavedId(contact.id);
  }

  const tableRows = [
    {
      key: "fullName" as const,
      label: "Full name",
      value: form.fullName,
      placeholder: "From the profile or conversation",
      source: fieldSources.fullName,
    },
    {
      key: "workEmail" as const,
      label: "Work email",
      value: form.workEmail,
      placeholder: "Run waterfall enrichment to find verified work email",
      source: fieldSources.workEmail,
      enrichable: "email" as const,
    },
    {
      key: "personalEmail" as const,
      label: "Personal email",
      value: form.personalEmail,
      placeholder: "From LinkedIn Contact info",
      source: fieldSources.personalEmail,
    },
    {
      key: "phone" as const,
      label: "Phone",
      value: form.phone,
      placeholder: "Mobile or work number",
      source: fieldSources.phone,
      enrichable: "phone" as const,
    },
    {
      key: "role" as const,
      label: "Role",
      value: form.role,
      placeholder: "e.g. Product designer",
      source: fieldSources.role,
    },
    {
      key: "company" as const,
      label: "Company",
      value: form.company,
      placeholder: "e.g. Northstar",
      source: fieldSources.company,
    },
    {
      key: "linkedinUrl" as const,
      label: "LinkedIn profile link",
      value: input,
      placeholder: "https://www.linkedin.com/in/username",
      source: fieldSources.linkedinUrl,
    },
  ];

  return (
    <BusinessShell
      active="contacts"
      title="Add from LinkedIn"
      subtitle="Paste a profile URL or capture from the browser extension."
      actions={
        <LinkButton size="small" variant="ghost" href="/business/contacts">
          <ArrowLeftIcon size={16} />Contacts
        </LinkButton>
      }
    >
      <form className="contact-form-card max-w-3xl mx-auto grid gap-6" onSubmit={save}>
        <header>
          <span className="step-pill">Capture people</span>
          <h1><LinkedinLogoIcon size={28} />LinkedIn profile</h1>
          <p>Review each field below. Personal email and phone come from LinkedIn Contact info. Use Find work email to run our verified database waterfall. We never fill guessed addresses.</p>
        </header>

        <ProfileCaptureTable
          rows={tableRows}
          onChange={updateField}
          onEnrich={enrichField}
          enrichingField={enrichingField}
          enrichmentSteps={enrichmentSteps}
          error={enrichError}
        />

        {parsed ? (
          <StatusMessage tone={lookupStatus === "ready" ? "success" : "info"}>
            {lookupStatus === "loading"
              ? `Checking @${parsed.handle}…`
              : lookupMessage || `Saved profile link for @${parsed.handle}.`}
          </StatusMessage>
        ) : input.trim() ? (
          <StatusMessage tone="error">That doesn&apos;t look like a LinkedIn profile URL.</StatusMessage>
        ) : null}
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        <div className="form-actions align-start">
          <Button type="button" variant="secondary" loading={lookupStatus === "loading"} onClick={refreshProfile}>
            <ArrowsClockwiseIcon size={16} />Check LinkedIn again
          </Button>
        </div>

        <TextAreaField
          label="What mattered?"
          hint="Private"
          value={form.context}
          onChange={(event) => setForm((current) => ({ ...current, context: event.target.value }))}
          rows={3}
          placeholder="Optional notes from the conversation."
        />
        {savedId ? (
          <>
            <StatusMessage tone="success">Saved to your contacts.</StatusMessage>
            <div className="form-actions align-start">
              <LinkButton variant="secondary" href="/business/contacts/linkedin">
                <LinkedinLogoIcon size={16} />Capture another profile
              </LinkButton>
            </div>
          </>
        ) : null}
        <div className="form-actions">
          <LinkButton variant="ghost" href="/business/contacts">Cancel</LinkButton>
          {!savedId ? (
            <Button type="submit"><FloppyDiskIcon size={18} />Save contact</Button>
          ) : (
            <>
              <LinkButton variant="secondary" href={`/business/contacts/${savedId}`}>Open contact</LinkButton>
              <LinkButton href={`/app/encounters/new?contact=${encodeURIComponent(savedId)}`}>
                <MicrophoneIcon size={18} />Capture moment
              </LinkButton>
            </>
          )}
        </div>
      </form>
    </BusinessShell>
  );
}
