"use client";

import { useMemo, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { Button } from "../components/Button";
import { TextField } from "../components/FormField";
import { PhoneField } from "../components/PhoneField";
import { createLibraryCard } from "../../lib/card-library";
import { upsertLibraryCard } from "../../lib/card-library";
import { queueCardSync } from "../../lib/card-library-sync";
import { themeGradientCss } from "../../lib/theme-contrast";
import { CardPreview } from "./CardPreview";

const themes = ["#9fe870", "#ff6b5e", "#ff9f43", "#2495e8", "#5146e5", "#163300"];

export function FirstCardForm({ initialName, initialEmail }: { initialName: string; initialEmail: string }) {
  const [name, setName] = useState(initialName);
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState("");
  const [theme, setTheme] = useState(themes[0]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const timeZone = useMemo(
    () => (typeof window === "undefined" ? "Europe/London" : Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"),
    [],
  );
  const locale = useMemo(
    () => (typeof navigator === "undefined" ? "en-GB" : navigator.language || "en-GB"),
    [],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) return setError("Enter the name you want on your card.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address for your card.");
    setLoading(true);
    setError("");
    try {
      const onboarding = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name.trim(), timeZone, locale }),
      });
      if (!onboarding.ok) {
        const body = await onboarding.json().catch(() => ({}));
        setError(body.error ?? "We couldn’t save your workspace. Please try again.");
        return;
      }

      const methods = [
        { id: crypto.randomUUID(), type: "email", value: email.trim(), label: "Email" },
        ...(phone.trim() ? [{ id: crypto.randomUUID(), type: "phone", value: phone.trim(), label: "Mobile" }] : []),
      ];

      const card = createLibraryCard({
        label: "My card",
        name: name.trim(),
        role: role.trim(),
        company: company.trim(),
        theme,
        methods,
      });

      const publish = await fetch("/api/cards/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
      });
      if (!publish.ok) {
        const body = await publish.json().catch(() => ({}));
        setError(body.error ?? "We couldn’t publish your card. Please try again.");
        return;
      }

      upsertLibraryCard(localStorage, card);
      queueCardSync(card);
      window.location.assign("/app/cards");
    } catch {
      setError("We couldn’t reach ehllo. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="onboarding-card-layout">
      <aside className="onboarding-card-preview-panel" aria-label="Live card preview">
        <p className="onboarding-preview-label">Live preview</p>
        <CardPreview name={name} role={role} company={company} theme={theme} email={email} phone={phone} />
      </aside>
      <form className="onboarding-form onboarding-card-form" onSubmit={submit}>
        <TextField label="Full name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        <TextField label="Job title" name="role" autoComplete="organization-title" placeholder="Founder, Designer, Consultant…" value={role} onChange={(event) => setRole(event.target.value)} />
        <TextField label="Company" name="company" autoComplete="organization" placeholder="Optional" value={company} onChange={(event) => setCompany(event.target.value)} />
        <TextField label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <PhoneField label="Phone" value={phone} onChange={setPhone} />
        <div className="onboarding-theme-picker">
          <span>Brand colour</span>
          <div className="onboarding-theme-swatches">
            {themes.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Use ${color}`}
                aria-pressed={theme === color}
                className={theme === color ? "selected" : ""}
                style={{ background: themeGradientCss(color) }}
                onClick={() => setTheme(color)}
              />
            ))}
          </div>
        </div>
        {error ? <p className="onboarding-error" role="alert">{error}</p> : null}
        <Button fullWidth type="submit" loading={loading}>
          {loading ? "Creating your card…" : "Create card and continue"} {!loading && <ArrowRightIcon weight="bold" />}
        </Button>
        <p className="onboarding-footnote">You can add LinkedIn, photos, and more contact methods from Cards after setup.</p>
      </form>
    </div>
  );
}
