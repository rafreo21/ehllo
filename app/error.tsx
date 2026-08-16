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
        <span className="route-state-mark">A</span>
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
