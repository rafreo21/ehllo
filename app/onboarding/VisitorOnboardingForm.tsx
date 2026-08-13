"use client";

import { useMemo, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { GoogleLogoIcon } from "@phosphor-icons/react/dist/csr/GoogleLogo";
import { Button } from "../components/Button";
import { TextField } from "../components/FormField";

export function VisitorOnboardingForm({
  initialName,
  slug,
  exchangeId,
  shareToken,
}: {
  initialName: string;
  slug?: string;
  exchangeId?: string;
  shareToken?: string;
}) {
  const [displayName, setDisplayName] = useState(initialName);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const payload = useMemo(() => ({
    displayName,
    ...(slug ? { slug } : {}),
    ...(exchangeId ? { exchangeId } : {}),
    ...(shareToken ? { shareToken } : {}),
  }), [displayName, slug, exchangeId, shareToken]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (displayName.trim().length < 2) {
      setError("Enter the name you want Ehllo to use.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : "We couldn’t save your account.");
        return;
      }
      window.location.assign("/app/people");
    } catch {
      setError("We couldn’t reach Ehllo. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="onboarding-form" onSubmit={submit}>
      <TextField
        label="Your name"
        name="displayName"
        autoComplete="name"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        error={error}
        autoFocus
      />
      <p className="visitor-onboarding-copy">No card setup required. Ehllo will remember the people you meet and shared meeting records.</p>
      <Button type="submit" loading={loading}>
        {loading ? "Saving…" : "Continue to people you've met"} {!loading && <ArrowRightIcon weight="bold" />}
      </Button>
    </form>
  );
}

export function VisitorGoogleButton({
  authHref,
  disabled,
}: {
  authHref: string;
  disabled?: boolean;
}) {
  return (
    <Button className="provider-button" fullWidth variant="secondary" disabled={disabled} onClick={() => { window.location.href = authHref; }}>
      <GoogleLogoIcon size={21} weight="bold" />
      Continue with Google
    </Button>
  );
}
