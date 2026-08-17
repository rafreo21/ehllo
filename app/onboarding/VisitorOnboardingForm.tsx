"use client";

import { useMemo, useState } from "react";
import { ArrowRight as ArrowRightIcon } from "react-feather";
import { Button } from "../components/Button";
import { TextField } from "../components/FormField";
import { GoogleProviderIcon } from "../components/ProviderIcons";

export function VisitorOnboardingForm({
  initialName,
  slug,
  exchangeId,
  shareToken,
  eventInviteToken,
}: {
  initialName: string;
  slug?: string;
  exchangeId?: string;
  shareToken?: string;
  eventInviteToken?: string;
}) {
  const [displayName, setDisplayName] = useState(initialName);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const payload = useMemo(() => ({
    displayName,
    ...(slug ? { slug } : {}),
    ...(exchangeId ? { exchangeId } : {}),
    ...(shareToken ? { shareToken } : {}),
    ...(eventInviteToken ? { eventInviteToken } : {}),
  }), [displayName, slug, exchangeId, shareToken, eventInviteToken]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (displayName.trim().length < 2) {
      setError("Enter the name you want ehllo to use.");
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
      setError("We couldn’t reach ehllo. Check your connection and try again.");
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
      <p className="visitor-onboarding-copy">No card setup required. ehllo will remember the people you meet and shared meeting records.</p>
      <Button type="submit" loading={loading}>
        {loading ? "Saving…" : "Continue to people you've met"} {!loading && <ArrowRightIcon />}
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
      <GoogleProviderIcon />
      Continue with Google
    </Button>
  );
}
