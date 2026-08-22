"use client";

import { useEffect, useState } from "react";

const HYDRATION_ERROR_CODES = ["418", "419", "421", "422", "425"];

function isHydrationError(error: Error) {
  return HYDRATION_ERROR_CODES.some((code) => error.message.includes(`react.dev/errors/${code}`));
}

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    console.error(error);
    if (typeof window !== "undefined") {
      void import("@sentry/nextjs").then((Sentry) => {
        Sentry.captureException(error);
      }).catch(() => {});
    }
    // Hydration mismatches (often caused by browser extensions injecting DOM
    // content before React attaches) are one-time by nature: once this retry
    // renders fully client-side, there's no server HTML left to mismatch
    // against. Auto-recover once instead of showing the error screen for
    // something that isn't a real app bug. Guarded so a genuinely broken
    // page doesn't get stuck retrying forever.
    if (isHydrationError(error) && typeof sessionStorage !== "undefined") {
      const key = "hydration-retry";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        reset();
      }
    }
  }, [error, reset]);

  return (
    <main className="route-state">
      <div className="route-error-panel" role="alert">
        <svg className="route-state-illustration" width="104" height="104" viewBox="0 0 120 120" fill="none" aria-hidden="true">
          <circle cx="60" cy="62" r="52" fill="#E2F6D5" />
          <rect x="32" y="38" width="56" height="40" rx="10" fill="#FFFFFF" stroke="#163300" strokeWidth="3" />
          <path d="M32 54h56" stroke="#163300" strokeWidth="3" />
          <circle cx="41" cy="46" r="3" fill="#163300" />
          <circle cx="51" cy="46" r="3" fill="#163300" />
          <path d="M42 66h30" stroke="#163300" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 7" />
          <path d="M42 72h20" stroke="#163300" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 7" />
          <circle cx="94" cy="40" r="3.5" fill="#9FE870" />
          <circle cx="100" cy="52" r="2.5" fill="#9FE870" />
          <circle cx="24" cy="88" r="3" fill="#9FE870" />
        </svg>
        <h1>{offline ? "You’re offline." : "Something didn’t load."}</h1>
        <p>
          {offline
            ? "This card lives online. Connect to the internet, then open the link again."
            : "Your information is safe. Check your connection and try this page again."}
        </p>
        <div>
          <button type="button" onClick={reset}>Try again</button>
          <a href="/">Return home</a>
        </div>
      </div>
    </main>
  );
}
