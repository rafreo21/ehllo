"use client";

import { useMemo, useState } from "react";

import { BrandMark } from "../../components/BrandMark";
import "../auth.css";

function readParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  return value?.trim() || "";
}

export function MobileReturnClient({ appBaseUrl }: { appBaseUrl: string }) {
  const params = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const code = readParam(params, "code");
  const oauthError = readParam(params, "error") || readParam(params, "error_description");
  const returnTo = readParam(params, "return_to") || "aftermeet://auth/callback";
  const [opened, setOpened] = useState(false);

  const appLink = code ? buildAppLink(returnTo, code) : "";

  if (oauthError) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <BrandMark size={40} />
          <h1>Sign-in link problem</h1>
          <p className="auth-copy">{oauthError}</p>
          <a className="auth-button" href={`${appBaseUrl}/auth`}>Request a new link</a>
        </section>
      </main>
    );
  }

  if (!code) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <BrandMark size={40} />
          <h1>Missing sign-in response</h1>
          <p className="auth-copy">Request a new email link from the ehllo app, then open it on this phone.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <BrandMark size={40} />
        <h1>Continue in ehllo</h1>
        <p className="auth-copy">
          Your email sign-in succeeded. Tap below to return to the ehllo app and finish signing in.
        </p>
        <button
          type="button"
          className="auth-button"
          onClick={() => {
            setOpened(true);
            window.location.assign(appLink);
          }}>
          Open ehllo
        </button>
        {opened ? (
          <p className="auth-copy">
            If nothing opened, switch back to ehllo and enter the 6-digit code from your email instead.
          </p>
        ) : null}
      </section>
    </main>
  );
}

function buildAppLink(returnTo: string, code: string) {
  try {
    const target = new URL(returnTo);
    target.searchParams.set("code", code);
    return target.toString();
  } catch {
    const separator = returnTo.includes("?") ? "&" : "?";
    return `${returnTo}${separator}code=${encodeURIComponent(code)}`;
  }
}
