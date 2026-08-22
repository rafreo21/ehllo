"use client";

import { useState } from "react";
import { ArrowRight as ArrowRightIcon } from "react-feather";
import { Button } from "../components/Button";
import { TextField } from "../components/FormField";

export function OnboardingForm({
  initialName,
  mode = "personal",
  redirectTo = "/app",
}: {
  initialName: string;
  mode?: "personal" | "team";
  redirectTo?: string;
}) {
  const [displayName, setDisplayName] = useState(initialName);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (displayName.trim().length < 2) return setError("Enter the name you want ehllo to use.");
    setLoading(true);
    setError("");
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
    const locale = navigator.language || "en-GB";
    try {
      if (mode === "team" || redirectTo === "/app") {
        const response = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: displayName.trim(), timeZone, locale }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setError(body.error ?? "We couldn’t save your workspace. Please try again.");
          return;
        }
        window.location.assign(redirectTo);
        return;
      }

      window.location.assign(`${redirectTo}?name=${encodeURIComponent(displayName.trim())}`);
    } catch {
      setError("We couldn’t reach ehllo. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="onboarding-form" onSubmit={submit}>
      <TextField
        label="Display name"
        name="displayName"
        autoComplete="name"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        hint="How your name appears in ehllo."
        error={error}
        autoFocus
      />
      <p className="onboarding-footnote">
        Time zone and language are detected automatically from your device. No need to configure locale codes here.
      </p>
      <Button fullWidth type="submit" loading={loading}>
        {loading ? "Saving…" : mode === "team" ? "Continue to workspace" : "Continue to card setup"}
        {!loading && <ArrowRightIcon />}
      </Button>
    </form>
  );
}
