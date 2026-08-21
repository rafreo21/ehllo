"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { PageSkeleton, StatusMessage } from "../../../components/AsyncState";
import { Button } from "../../../components/Button";

/**
 * Opens a meeting from a notification, on the web.
 *
 * Every notification carrying an encounter linked to /app/encounters/[id], and that route
 * does not exist - the only page under encounters is `new`. So being told about a meeting,
 * a follow-up or a share on the web led to a 404, for every type, every time.
 *
 * There is no owner-side meeting page on the web yet; the guest view at /e/[token] is the one
 * place a meeting can be read. So this resolves the token the caller is entitled to and sends
 * them there, which is right for anyone the meeting was shared with - and says plainly when it
 * has not been shared rather than showing them a broken page.
 */
export default function MeetingRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "not-shared" | "error">("loading");

  useEffect(() => {
    const id = typeof params?.id === "string" ? params.id : "";
    let cancelled = false;

    if (!id) {
      // Deferred to a microtask like the other screens here: setting state as an effect's
      // first synchronous act is a cascading render.
      void Promise.resolve().then(() => { if (!cancelled) setStatus("error"); });
      return () => { cancelled = true; };
    }

    void (async () => {
      try {
        const response = await fetch(`/api/encounters/${encodeURIComponent(id)}/share-token`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({})) as { shareToken?: string };
        if (cancelled) return;
        if (response.ok && payload.shareToken) {
          router.replace(`/e/${encodeURIComponent(payload.shareToken)}`);
          return;
        }
        // 404 here is a settled answer - not shared with you - rather than a fault.
        setStatus(response.status === 404 ? "not-shared" : "error");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => { cancelled = true; };
  }, [params?.id, router]);

  return (
    <div className="flow-page">
      <header className="flow-page-header">
        <div>
          <h1>Meeting</h1>
          <p>Opening the recap that was shared with you.</p>
        </div>
      </header>

      {status === "loading" ? <PageSkeleton rows={3} /> : null}

      {status === "not-shared" ? (
        <StatusMessage tone="info">
          <strong>Not shared yet.</strong>{" "}
          Whoever recorded this has not shared the recap. Ask them from the ehllo app on your phone,
          and you will be told the moment they do.
        </StatusMessage>
      ) : null}

      {status === "error" ? (
        <StatusMessage tone="error">We couldn’t open this meeting. Try again in a moment.</StatusMessage>
      ) : null}

      {status !== "loading" ? (
        <Button variant="secondary" onClick={() => router.push("/app/followups")}>Back to follow-ups</Button>
      ) : null}
    </div>
  );
}
