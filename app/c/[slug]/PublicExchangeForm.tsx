"use client";

import { useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { BriefcaseIcon } from "@phosphor-icons/react/dist/csr/Briefcase";
import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { Button } from "../../components/Button";
import { ContactMethodIcon } from "../../components/ContactMethodIcon";
import { TextField } from "../../components/FormField";
import { PhoneField } from "../../components/PhoneField";
import { themeForegroundColor, themeGradientCss } from "@/lib/theme-contrast";

type OptionalField = "x" | "instagram" | "tiktok" | "linkedin" | "role" | "company";

const OPTIONAL_PILLS: { id: OptionalField; label: string; fieldLabel: string; placeholder: string }[] = [
  { id: "x", label: "X", fieldLabel: "X handle (optional)", placeholder: "@username" },
  { id: "instagram", label: "Instagram", fieldLabel: "Instagram handle (optional)", placeholder: "@username" },
  { id: "tiktok", label: "TikTok", fieldLabel: "TikTok handle (optional)", placeholder: "@username" },
  { id: "linkedin", label: "LinkedIn", fieldLabel: "LinkedIn profile (optional)", placeholder: "linkedin.com/in/you" },
  { id: "role", label: "Job title", fieldLabel: "Job title (optional)", placeholder: "Product designer" },
  { id: "company", label: "Company name", fieldLabel: "Company name (optional)", placeholder: "Acme Inc." },
];

function OptionalPillIcon({ field }: { field: OptionalField }) {
  if (field === "role") return <BriefcaseIcon size={14} weight="bold" aria-hidden />;
  if (field === "company") return <BuildingsIcon size={14} weight="bold" aria-hidden />;
  return <ContactMethodIcon type={field} size={14} />;
}

function buildNote(
  ownerName: string,
  social: Record<"x" | "instagram" | "tiktok" | "linkedin", string>,
) {
  const lines = [`Shared back from ${ownerName}'s Ehllo card.`];
  if (social.x.trim()) lines.push(`X: ${social.x.trim()}`);
  if (social.instagram.trim()) lines.push(`Instagram: ${social.instagram.trim()}`);
  if (social.tiktok.trim()) lines.push(`TikTok: ${social.tiktok.trim()}`);
  if (social.linkedin.trim()) lines.push(`LinkedIn: ${social.linkedin.trim()}`);
  return lines.join("\n");
}

export function PublicExchangeForm({
  slug,
  ownerName,
  themeColor,
  onSent,
}: {
  slug: string;
  ownerName: string;
  themeColor: string;
  onSent?: (visitorEmail: string) => void;
}) {
  const [activeFields, setActiveFields] = useState<Set<OptionalField>>(new Set());
  const [fullName, setFullName] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [visitorCompany, setVisitorCompany] = useState("");
  const [visitorRole, setVisitorRole] = useState("");
  const [visitorX, setVisitorX] = useState("");
  const [visitorInstagram, setVisitorInstagram] = useState("");
  const [visitorTiktok, setVisitorTiktok] = useState("");
  const [visitorLinkedin, setVisitorLinkedin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function showField(field: OptionalField) {
    setActiveFields((current) => new Set(current).add(field));
  }

  function hideField(field: OptionalField) {
    setActiveFields((current) => {
      const next = new Set(current);
      next.delete(field);
      return next;
    });
    setFieldValue(field, "");
  }

  function fieldValue(field: OptionalField) {
    if (field === "x") return visitorX;
    if (field === "instagram") return visitorInstagram;
    if (field === "tiktok") return visitorTiktok;
    if (field === "linkedin") return visitorLinkedin;
    if (field === "role") return visitorRole;
    return visitorCompany;
  }

  function setFieldValue(field: OptionalField, value: string) {
    if (field === "x") setVisitorX(value);
    else if (field === "instagram") setVisitorInstagram(value);
    else if (field === "tiktok") setVisitorTiktok(value);
    else if (field === "linkedin") setVisitorLinkedin(value);
    else if (field === "role") setVisitorRole(value);
    else setVisitorCompany(value);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const visitorName = fullName.trim();
    if (visitorName.length < 2) {
      setError("Enter your full name.");
      return;
    }
    if (!visitorEmail.trim() || !visitorEmail.includes("@")) {
      setError("Email is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/cards/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          visitorName,
          visitorEmail: visitorEmail.trim(),
          visitorPhone: visitorPhone.trim(),
          visitorCompany: visitorCompany.trim(),
          visitorRole: visitorRole.trim(),
          note: buildNote(ownerName, {
            x: visitorX,
            instagram: visitorInstagram,
            tiktok: visitorTiktok,
            linkedin: visitorLinkedin,
          }),
          consentGiven: true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "We couldn’t send your details.");
        return;
      }
      onSent?.(visitorEmail.trim());
    } catch {
      setError("We couldn’t reach Ehllo. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="public-exchange-form" onSubmit={submit} noValidate>
      <TextField
        id="exchange-full-name"
        label="Full name"
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        autoComplete="name"
        required
      />
      <TextField
        id="exchange-email"
        label="Email"
        type="email"
        value={visitorEmail}
        onChange={(event) => setVisitorEmail(event.target.value)}
        autoComplete="email"
        required
      />
      <PhoneField
        id="exchange-phone"
        label="Phone number (optional)"
        value={visitorPhone}
        onChange={setVisitorPhone}
      />

      <div className="public-exchange-optional">
        {OPTIONAL_PILLS.filter((pill) => activeFields.has(pill.id)).map((pill) => (
          <div key={pill.id} className="public-exchange-optional-field">
            <TextField
              id={`exchange-${pill.id}`}
              label={pill.fieldLabel}
              value={fieldValue(pill.id)}
              onChange={(event) => setFieldValue(pill.id, event.target.value)}
              autoComplete={pill.id === "role" ? "organization-title" : pill.id === "company" ? "organization" : "off"}
              placeholder={pill.placeholder}
            />
            <button
              type="button"
              className="public-exchange-remove"
              aria-label={`Remove ${pill.label}`}
              onClick={() => hideField(pill.id)}
            >
              <XIcon size={16} weight="bold" aria-hidden />
            </button>
          </div>
        ))}

        <div className="public-exchange-optional-pills">
          {OPTIONAL_PILLS.map((pill) =>
            activeFields.has(pill.id) ? null : (
              <button key={pill.id} type="button" className="public-exchange-add" onClick={() => showField(pill.id)}>
                <OptionalPillIcon field={pill.id} />
                {pill.label}
              </button>
            ),
          )}
        </div>
      </div>

      {error ? <p className="public-exchange-error" role="alert">{error}</p> : null}
      <Button
        fullWidth
        type="submit"
        loading={loading}
        style={{ background: themeGradientCss(themeColor), color: themeForegroundColor(themeColor) }}>
        {loading ? "Sending…" : "Send my details"} {!loading && <ArrowRightIcon size={18} weight="bold" />}
      </Button>
      <small className="public-exchange-privacy">We don&apos;t sell your contact details.</small>
    </form>
  );
}
