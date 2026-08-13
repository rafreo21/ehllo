import { headers } from "next/headers";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { resolveAppUrlFromHeaders } from "../../lib/auth/app-url";
import { readPublicSupabaseConfig } from "../../lib/supabase/env";
import { sanitizeIntendedDestination } from "../../lib/auth/redirect";
import { parseVisitorIntent, VISITOR_DEFAULT_DESTINATION } from "../../lib/auth/visitor-intent";
import { AuthForm } from "./AuthForm";
import { BrandMark } from "../components/BrandMark";
import { LinkButton } from "../components/Button";
import "./auth.css";

type ProviderAvailability = {
  google: boolean;
  linkedin_oidc: boolean;
  x: boolean;
};

async function readProviderAvailability(url: string, anonKey: string): Promise<ProviderAvailability | null> {
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    return {
      google: Boolean(settings.external?.google),
      linkedin_oidc: Boolean(settings.external?.linkedin_oidc),
      x: Boolean(settings.external?.x ?? settings.external?.twitter),
    };
  } catch {
    return null;
  }
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; intent?: string; slug?: string; exchangeId?: string; shareToken?: string; email?: string }>;
}) {
  const params = await searchParams;
  const visitorIntent = parseVisitorIntent(new URLSearchParams(params as Record<string, string>));
  const next = sanitizeIntendedDestination(params.next)
    || (visitorIntent ? VISITOR_DEFAULT_DESTINATION : "/app");
  const environment = readPublicSupabaseConfig();
  const appUrl = resolveAppUrlFromHeaders(await headers());
  const errors: Record<string, string> = {
    callback: "That sign-in session is invalid or has expired. Request a new code.",
    provisioning: "We couldn’t create your private workspace. Your session was closed; please try again.",
  };
  const providerAvailability = environment.config
    ? await readProviderAvailability(environment.config.url, environment.config.anonKey)
    : null;
  return (
    <main className="auth-page">
      <div className="auth-header">
        <a className="auth-logo" href="/"><BrandMark size={40} /><strong>ehllo</strong></a>
        <LinkButton size="small" variant="ghost" href="/"><ArrowLeftIcon size={16} weight="bold" />Back to home</LinkButton>
      </div>
      <section className="auth-panel">
        <div className="auth-intro">
          <span><b className="auth-emoji" aria-hidden="true">👋</b> Welcome</span>
          <h1>{visitorIntent ? "Remember who you meet." : <>Sign in or sign up<br />in seconds.</>}</h1>
          <p>{visitorIntent
            ? "Create a light ehllo account to keep cards and shared meeting records in one place."
            : "Enter your email and we’ll send a 6-digit sign-in code."}</p>
        </div>
        {!environment.config ? (
          <div className="auth-config" role="alert">
            <strong>Authentication is not configured.</strong>
            <p>Add {environment.missing.join(", ")} to your local environment, then restart the app.</p>
          </div>
        ) : (
          <AuthForm
            appUrl={appUrl}
            next={next}
            visitorIntent={visitorIntent}
            initialError={params.error ? errors[params.error] ?? "" : ""}
            initialEmail={visitorIntent?.email || params.email?.trim().toLowerCase() || ""}
            providerAvailability={providerAvailability}
          />
        )}
      </section>
      <footer className="auth-footer"><span>Private by default</span></footer>
    </main>
  );
}
