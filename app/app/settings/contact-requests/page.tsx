"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
type RequestGroup = {
  key: string;
  requesterName: string;
  fieldType: string;
  /** Every ask from this person for this detail. Answering once clears all of them. */
  ids: string[];
  count: number;
  latestAt: string;
  followUpTitle?: string | null;
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

/**
 * Mirrors relativeTime in components/NotificationBell.tsx. Same reason as fieldLabel:
 * a copy is cheaper than a shared module, and that file is the original.
 */
function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** How many times this person has asked, said the way a person would say it. */
function askedCaption(group: RequestGroup) {
  if (group.count <= 1) return `Asked ${relativeTime(group.latestAt)}`;
  return `Asked ${group.count} times \u00b7 last ${relativeTime(group.latestAt)}`;
}

/**
 * The illustration on the success sheet: a card handed over, ticked.
 *
 * Inline rather than a file because it is eleven elements and lives in exactly one
 * place, and it inherits currentColor so it needs no dark-mode counterpart.
 */
function SharedIllustration() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="Detail shared" focusable="false">
      <circle cx="48" cy="48" r="46" fill="var(--p-ice)" />
      <rect x="22" y="30" width="52" height="34" rx="6" fill="white" stroke="var(--p-navy)" strokeWidth="2.5" />
      <path d="M30 42h16M30 50h11" stroke="var(--p-navy)" strokeWidth="2.5" strokeLinecap="round" opacity=".45" />
      <circle cx="66" cy="62" r="15" fill="var(--p-navy)" />
      <path d="M59.5 62.5l4.5 4.5 8.5-9" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ContactRequestsPage() {
  useAppShellChrome({ backHref: "/app/settings", backLabel: "Settings" });
  const { showToast } = useToast();
  const [groups, setGroups] = useState<RequestGroup[]>([]);
  const [truncated, setTruncated] = useState(0);
  // What my own card already publishes, keyed by method type. The phone has always
  // pre-filled from this; the web asked you to type a handle ehllo already knew, which
  // is the friction you actually feel - not the confirming tap.
  const [myMethods, setMyMethods] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState<RequestGroup | null>(null);
  const [shared, setShared] = useState<RequestGroup | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState("");
  // Arrived from a notification, so the sheet should already be up. A ref because it is
  // a one-shot intent, not state: opening it again on every refetch would fight anyone
  // who closed it deliberately.
  const openOnArrival = useRef(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("open") === "1",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Both at once: the requests are useless without knowing what I can already share,
      // and two sequential round trips would show an empty box before filling it in.
      const [response, cardsResponse] = await Promise.all([
        fetch("/api/contact-requests", { cache: "no-store" }),
        fetch("/api/cards", { cache: "no-store" }),
      ]);

      // Hoisted rather than scoped to the try, because the auto-open below needs the
      // values just loaded - reading myMethods there would read the previous render's.
      let found: Record<string, string> = {};
      // Best effort - failing to read my own card must not stop me answering, it only
      // means typing the value in as before.
      try {
        const cardsPayload = await cardsResponse.json() as {
          cards?: Array<{ methods?: Array<{ type?: string; value?: string }> }>;
        };
        for (const card of cardsPayload.cards ?? []) {
          for (const method of card.methods ?? []) {
            const type = method.type?.trim().toLowerCase();
            const value = method.value?.trim();
            // First card wins - /api/cards returns most recently updated first, which is
            // the one whose details are current.
            if (type && value && !found[type]) found[type] = value;
          }
        }
        setMyMethods(found);
      } catch {
        found = {};
        setMyMethods({});
      }
      const payload = await response.json() as {
        groups?: RequestGroup[];
        groupsTruncated?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Could not load contact requests.");
      const loadedGroups = payload.groups ?? [];
      setGroups(loadedGroups);
      setTruncated(payload.groupsTruncated ?? 0);

      // Straight into the sheet when there is one thing waiting - which is the usual
      // case after being told about it. With several, the list is the honest answer:
      // guessing which one the notification meant would open the wrong person's request.
      if (openOnArrival.current) {
        openOnArrival.current = false;
        const only = loadedGroups.length === 1 ? loadedGroups[0] : null;
        if (only) {
          setActive(only);
          setValue(found[only.fieldType.trim().toLowerCase()] ?? "");
          setSheetError("");
        }
      }
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

  function openRequest(group: RequestGroup) {
    setActive(group);
    // Pre-filled when my card already publishes it, so answering is one tap and no
    // typing. Left empty rather than guessed at when it is something I do not publish.
    setValue(myMethods[group.fieldType.trim().toLowerCase()] ?? "");
    setSheetError("");
  }

  async function answer(share: boolean) {
    if (!active) return;
    // Declining needs no value; sharing nothing would send an empty detail and read as
    // an answer, which is worse than not answering.
    if (share && !value.trim()) {
      setSheetError(`Add your ${fieldLabel(active.fieldType)} before sharing it.`);
      return;
    }
    setBusy(true);
    setSheetError("");
    try {
      const response = await fetch("/api/contact-requests/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Every id in the group, so one answer clears all of this person's asks for
        // this detail rather than leaving the rest pending forever.
        body: JSON.stringify({ ids: active.ids, share, value: share ? value.trim() : undefined }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not answer this request.");
      // Dropped locally rather than refetching: the row is answered and the list only
      // ever holds pending ones, so a reload would show the same thing a moment later.
      setGroups((current) => current.filter((item) => item.key !== active.key));
      const answered = active;
      setActive(null);
      // Sharing gets its own confirmation, because handing someone your number is worth
      // acknowledging. Declining does not need a celebration - a toast is the right size.
      if (share) setShared(answered);
      else showToast({ message: "Declined. They have been told.", tone: "success" });
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

        {!loading && !error && !groups.length ? (
          <StatusMessage tone="info">
            <strong>Nothing waiting.</strong>{" "}
            When someone asks for a phone number, email or handle you have not shared, it appears here.
          </StatusMessage>
        ) : null}

        {!loading && groups.length ? (
          <div className="connections-list">
            {groups.map((group) => (
              <button
                key={group.key}
                type="button"
                className="connections-row connections-row-simple"
                onClick={() => openRequest(group)}>
                <div className="connections-copy request-row-copy">
                  <strong>{group.requesterName} asked for your {fieldLabel(group.fieldType)}</strong>
                  <small>{askedCaption(group)}</small>
                </div>
                {/* Only shown when it is more than one ask - a "1" next to a single request
                    is noise, and the caption already says when it arrived. */}
                {group.count > 1 ? <span className="request-count-pill">{group.count}</span> : null}
              </button>
            ))}
          </div>
        ) : null}

        {/* Said plainly rather than hidden, because a list that silently stops at twenty
            looks like a list of everything. Answering clears whole people at a time, so
            the rest surface on the next load. */}
        {!loading && truncated > 0 ? (
          <p className="followup-count-caption">
            {truncated} more {truncated === 1 ? "person is" : "people are"} waiting. Answer these and they will appear here.
          </p>
        ) : null}
      </div>

      {active ? (
        <div
          className="connections-modal-backdrop"
          role="presentation"
          onClick={() => { if (!busy) setActive(null); }}>
          <div
            className="connections-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Share your ${fieldLabel(active.fieldType)}`}
            onClick={(event) => event.stopPropagation()}>
            <h2>Share your {fieldLabel(active.fieldType)}?</h2>
            {/* Short on purpose. The long version explained the whole mechanism at
                somebody trying to do one thing, and the buttons already say what happens. */}
            <p className="text-sm text-[#6b7168]">
              {active.count > 1
                ? `Asked ${active.count} times. One answer clears them all.`
                : `Only ${active.requesterName} sees it.`}
            </p>

            <label className="connections-search">
              <input
                type="text"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={`Your ${fieldLabel(active.fieldType)}`}
                autoFocus
              />
            </label>

            {/* Says where the value came from, so a pre-filled box does not look like
                something already sent, or like a stray value from somewhere else. */}
            {!sheetError && value && myMethods[active.fieldType.trim().toLowerCase()] === value ? (
              <p className="request-prefill-note">From your card. Change it here if you want to send something else.</p>
            ) : null}
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

      {/* Worth its own sheet rather than a toast. Handing over a phone number is a
          decision, and when it clears fifteen separate asks at once the person deserves
          to be told that plainly - otherwise the list emptying out looks like a bug. */}
      {shared ? (
        <div
          className="connections-modal-backdrop"
          role="presentation"
          onClick={() => setShared(null)}>
          <div
            className="connections-modal request-shared-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Shared"
            onClick={(event) => event.stopPropagation()}>
            <SharedIllustration />
            <h2>Shared with {shared.requesterName}</h2>
            <p className="text-sm text-[#6b7168]">
              {shared.count > 1
                ? `Your ${fieldLabel(shared.fieldType)} is on its way, and all ${shared.count} of their requests are closed. They have been told.`
                : `Your ${fieldLabel(shared.fieldType)} is on its way. They have been told.`}
            </p>
            <Button onClick={() => setShared(null)}>Done</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
