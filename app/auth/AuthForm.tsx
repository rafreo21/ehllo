"use client";

import { useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react/dist/csr/EnvelopeSimple";
import { GoogleLogoIcon } from "@phosphor-icons/react/dist/csr/GoogleLogo";
import { LinkedinLogoIcon } from "@phosphor-icons/react/dist/csr/LinkedinLogo";
import { XLogoIcon } from "@phosphor-icons/react/dist/csr/XLogo";
import { describeOtpDeliveryError } from "../../lib/auth/otp-delivery-error";
import { appendVisitorIntentToCallback, VISITOR_DEFAULT_DESTINATION, type VisitorIntent, visitorOnboardingPath } from "../../lib/auth/visitor-intent";
import { Button } from "../components/Button";
import { TextField } from "../components/FormField";
import { createClient } from "../../lib/supabase/client";

type SocialProvider = "google" | "linkedin_oidc" | "x";
type ProviderAvailability = Record<SocialProvider, boolean> | null;

type ProvisionResult = { onboarding_status?: string };

export function AuthForm({
  appUrl,
  next,
  visitorIntent,
  initialError,
  initialEmail = "",
  providerAvailability,
}: {
  appUrl: string;
  next: string;
  visitorIntent: VisitorIntent | null;
  initialError: string;
  initialEmail?: string;
  providerAvailability: ProviderAvailability;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState(initialError);
  const [providerError, setProviderError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<SocialProvider | null>(null);

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    setError("");
    setProviderError("");
    try {
      const { error: authError } = await createClient().auth.signInWithOtp({
        email: normalized,
        options: { shouldCreateUser: true },
      });
      if (authError) {
        setError(describeOtpDeliveryError(authError));
        return;
      }
      setSentTo(normalized);
      setStep("code");
      setCode("");
    } catch {
      setError("We couldn’t reach the sign-in service. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: sentTo,
        token,
        type: "email",
      });
      if (verifyError) {
        setError(verifyError.message || "That code is invalid or expired. Request a new one.");
        return;
      }

      const { data: provisioned, error: provisionError } = await supabase
        .rpc("provision_personal_workspace")
        .single<ProvisionResult>();

      let onboardingStatus = provisioned?.onboarding_status;
      if (provisionError || !onboardingStatus) {
        const { data: context } = await supabase.rpc("get_my_app_context").single<ProvisionResult>();
        onboardingStatus = context?.onboarding_status;
      }

      if (!onboardingStatus) {
        await supabase.auth.signOut();
        setError("We couldn’t create your workspace. Please try again.");
        return;
      }

      await supabase.rpc("link_people_connections_for_email");

      if (onboardingStatus !== "completed") {
        window.location.assign(visitorIntent ? visitorOnboardingPath(visitorIntent) : "/onboarding");
        return;
      }

      window.location.assign(visitorIntent ? VISITOR_DEFAULT_DESTINATION : next);
    } catch {
      setError("We couldn’t verify that code. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function signInWithProvider(provider: SocialProvider) {
    const providerName = provider === "linkedin_oidc" ? "LinkedIn" : provider === "x" ? "X" : "Google";
    if (providerAvailability?.[provider] === false) {
      setProviderError(`${providerName} sign-in is not available yet. Continue securely with email.`);
      return;
    }
    setLoadingProvider(provider);
    setError("");
    setProviderError("");
    const callback = new URL("/auth/callback", appUrl || window.location.origin);
    callback.searchParams.set("next", next);
    appendVisitorIntentToCallback(callback, visitorIntent);
    try {
      const { error: authError } = await createClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo: callback.toString() },
      });
      if (authError) {
        setProviderError(`We couldn’t connect to ${providerName}. Continue with email or try again.`);
        setLoadingProvider(null);
      }
    } catch {
      setProviderError(`We couldn’t reach ${providerName}. Check your connection or continue with email.`);
      setLoadingProvider(null);
    }
  }

  if (step === "code" && sentTo) {
    return (
      <div className="auth-success" aria-live="polite">
        <div><CheckCircleIcon size={35} weight="fill" /></div>
        <span>Code sent</span>
        <h1>Check your inbox.</h1>
        <p>We sent a 6-digit sign-in code to <strong>{sentTo}</strong>. Enter it below to continue.</p>
        <form onSubmit={verifyCode} noValidate>
          <TextField
            id="auth-code"
            label="Sign-in code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            error={error}
            autoFocus
          />
          <Button fullWidth type="submit" loading={loading} disabled={code.replace(/\D/g, "").length < 6}>
            {loading ? "Verifying…" : "Continue"}
          </Button>
        </form>
        <Button fullWidth variant="ghost" onClick={() => void sendCode()} disabled={loading}>
          Resend code
        </Button>
        <Button fullWidth variant="ghost" onClick={() => { setStep("email"); setSentTo(""); setCode(""); setError(""); }}>
          Use another email
        </Button>
      </div>
    );
  }

  return (
    <div className="auth-options">
      <form onSubmit={sendCode} noValidate>
        <TextField id="auth-email" label="Email address" type="email" autoComplete="email" inputMode="email"
          placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)}
          leadingIcon={<EnvelopeSimpleIcon size={21} weight="bold" />} error={error} autoFocus />
        <Button fullWidth type="submit" loading={loading} disabled={!email || Boolean(loadingProvider)}>
          {loading ? "Sending code…" : "Continue"} {!loading && <ArrowRightIcon size={20} weight="bold" />}
        </Button>
      </form>
      <div className="auth-divider"><span>or continue with</span></div>
      {providerAvailability && !Object.values(providerAvailability).some(Boolean) && (
        <p className="auth-provider-notice" role="status">
          Social sign-in is being configured. Email sign-in is available now.
        </p>
      )}
      <div className="provider-list">
        <Button className="provider-button" fullWidth variant="secondary" disabled={Boolean(loadingProvider) || providerAvailability?.google === false} onClick={() => void signInWithProvider("google")}>
          <GoogleLogoIcon size={21} weight="bold" />
          {loadingProvider === "google" ? "Connecting to Google…" : "Continue with Google"}
          <span>{providerAvailability?.google === false ? "Soon" : "Account"}</span>
        </Button>
        <Button className="provider-button" fullWidth variant="secondary" disabled={Boolean(loadingProvider) || providerAvailability?.linkedin_oidc === false} onClick={() => void signInWithProvider("linkedin_oidc")}>
          <LinkedinLogoIcon size={21} weight="fill" />
          {loadingProvider === "linkedin_oidc" ? "Connecting to LinkedIn…" : "Continue with LinkedIn"}
          <span>{providerAvailability?.linkedin_oidc === false ? "Soon" : "Profile"}</span>
        </Button>
        <Button className="provider-button" fullWidth variant="secondary" disabled={Boolean(loadingProvider) || providerAvailability?.x === false} onClick={() => void signInWithProvider("x")}>
          <XLogoIcon size={20} weight="bold" />
          {loadingProvider === "x" ? "Connecting to X…" : "Continue with X"}
          <span>{providerAvailability?.x === false ? "Soon" : "Profile"}</span>
        </Button>
      </div>
      {providerError && <p className="auth-provider-error" role="alert">{providerError}</p>}
      <p className="auth-terms">By continuing, you agree to the <a href="/terms">Terms of Use</a> and acknowledge the <a href="/privacy">Privacy Policy</a>.</p>
    </div>
  );
}
