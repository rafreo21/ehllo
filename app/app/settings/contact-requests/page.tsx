"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppShellChrome } from "../../../components/AppShellChromeContext";
import { Button } from "../../../components/Button";
import { PageSkeleton, StatusMessage } from "../../../components/AsyncState";
import { useToast } from "../../../components/ToastContext";

/**
 * Answering a request for a contact detail, on the web.
 *
 * The endpoints have existed for a while and nothing used them: answering was possible
 * on the phone and impossible on the web, so anyone who works on a laptop could be told
 * somebody had asked for their number and had nowhere to answer. That is why "nowhere to
 * answer a contact request" stayed open in the activity log after the phone screen
 * shipped - it was half done, and the half nobody could see was the web.
 *
 * The wording deliberately matches the phone screen. Two surfaces describing the same
 * exchange in different words is how people come to distrust both.
 */
type IncomingRequest = {
  id: string;
  field_type: string;
  channel?: string | null;
  follow_up_title?: string | null;
  status: string;
  created_at?: string;
};

/**
 * Mirrors methodRequestLabel in mobile/src/features/follow-ups/channel-methods.ts. Kept
 * as a copy rather than an import because that module is mobile-only; if these ever
 * disagree, that file is the original.
 */
function fieldLabel(fieldType: string) {
  const type = fieldType.trim().toLowerCase();
  if (type === "preferred_contact") return "a way to reach you";
  if (type === "email") return "email address";
  if (type === "phone") return "phone number";
  return type.replace(/_/g, " ") || "contact detail";
}

export default function ContactRequestsPage() {
  useAppShellChrome({ backHref: "/app/settings", backLabel: "Settings" });
  const { showToast } = useToast();
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState<IncomingRequest | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/contact-requests", { cache: "no-store" });
      const payload = await response.json() as { requests?: IncomingRequest[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load contact requests.");
      setRequests(payload.requests ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load contact requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred to a microtask, matching recent-scans. load() sets state as its first
    // act, and doing that synchronously inside an effect is a cascading render.
    void Promise.resolve().then(() => load());

    // Reloaded when the tab regains focus, because the phone reloads on every screen
    // focus and a request answered there should not still be sitting here. Without it
    // the two surfaces disagree about what is pending, which is worse than either
    // being briefly stale.
    function refreshOnReturn() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => document.removeEventListener("visibilitychange", refreshOnReturn);
  }, [load]);

  function openRequest(request: IncomingRequest) {
    setActive(request);
    setValue("");
    setSheetError("");
  }

  async function answer(share: boolean) {
    if (!active) return;
    // Declining needs no value; sharing nothing would send an empty detail and read as
    // an answer, which is worse than not answering.
    if (share && !value.trim()) {
      setSheetError(`Add your ${fieldLabel(active.field_type)} before sharing it.`);
      return;
    }
    setBusy(true);
    setSheetError("");
    try {
      const response = await fetch("/api/contact-requests/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: active.id, share, value: share ? value.trim() : undefined }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not answer this request.");
      // Dropped locally rather than refetching: the row is answered and the list only
      // ever holds pending ones, so a reload would show the same thing a moment later.
      setRequests((current) => current.filter((item) => item.id !== active.id));
      setActive(null);
      showToast({
        message: share ? "Shared. They have been told." : "Declined. They have been told.",
        tone: "success",
      });
    } catch (caught) {
      setSheetError(caught instanceof Error ? caught.message : "Could not answer this request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flow-page settings-page">
        <header className="flow-page-header">
          <div>
            <h1>Contact requests</h1>
            <p>People asking for a way to reach you.</p>
          </div>
        </header>

        {loading ? <PageSkeleton rows={3} /> : null}
        {error ? (
          <StatusMessage
            tone="error"
            action={<button type="button" className="ghost-link" onClick={() => void load()}>Retry</button>}>
            {error}
          </StatusMessage>
        ) : null}

        {!loading && !error && !requests.length ? (
          <StatusMessage tone="info">
            <strong>Nothing waiting.</strong>{" "}
            When someone asks for a phone number, email or handle you have not shared, it appears here.
          </StatusMessage>
        ) : null}

        {!loading && requests.length ? (
          <div className="connections-list">
            {requests.map((request) => (
              <button
                key={request.id}
                type="button"
                className="connections-row connections-row-simple"
                onClick={() => openRequest(request)}>
                <div className="connections-copy">
                  <strong>Someone asked for your {fieldLabel(request.field_type)}</strong>
                  <small>
                    {request.follow_up_title?.trim()
                      ? `About: ${request.follow_up_title.trim()}`
                      : "Tap to share it or decline"}
                  </small>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {active ? (
        <div
          className="connections-modal-backdrop"
          role="presentation"
          onClick={() => { if (!busy) setActive(null); }}>
          <div
            className="connections-modal connections-modal-compact"
            role="dialog"
            aria-modal="true"
            aria-label={`Share your ${fieldLabel(active.field_type)}`}
            onClick={(event) => event.stopPropagation()}>
            <h2>Share your {fieldLabel(active.field_type)}?</h2>
            <p className="text-sm text-[#6b7168]">
              Only this one detail is shared, and only with the person who asked. Declining tells them too,
              so nobody is left waiting on an answer that is not coming.
            </p>

            <label className="connections-search">
              <input
                type="text"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={`Your ${fieldLabel(active.field_type)}`}
                autoFocus
              />
            </label>

            {sheetError ? <StatusMessage tone="error">{sheetError}</StatusMessage> : null}

            <div className="connections-add-options" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <Button loading={busy} onClick={() => void answer(true)}>Share it</Button>
              <Button variant="secondary" disabled={busy} onClick={() => void answer(false)}>Not this time</Button>
              <button type="button" className="ghost-link" disabled={busy} onClick={() => setActive(null)}>
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
