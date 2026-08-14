"use client";

import { useEffect, useState } from "react";
import { buildAuthHref } from "../../../lib/auth/visitor-intent";

type Invitation = {
  email: string;
  status: "invited" | "going" | "not_going";
  event: { id: string; title: string; location: string; startsAt: string; endsAt: string | null; status: "scheduled" | "cancelled" };
};

function eventWhen(invitation: Invitation) {
  const start = new Date(invitation.event.startsAt);
  const end = invitation.event.endsAt ? new Date(invitation.event.endsAt) : null;
  if (Number.isNaN(start.getTime())) return "Date to be confirmed";
  const startCopy = start.toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  if (!end || Number.isNaN(end.getTime())) return startCopy;
  return `${startCopy} – ${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function GuestEventInvitation({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch(`/api/event-invitations/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.invitation) throw new Error(payload.error || "This invitation is unavailable.");
        setInvitation(payload.invitation);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "This invitation is unavailable."));
  }, [token]);

  async function respond(status: "going" | "not_going") {
    if (!invitation) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/event-invitations/${encodeURIComponent(token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "We couldn’t save your response.");
      setInvitation({ ...invitation, status });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t save your response.");
    } finally {
      setSaving(false);
    }
  }

  if (error && !invitation) return <main className="event-invite-page"><section className="event-invite-card"><p className="event-invite-kicker">Private event invitation</p><h1>Invitation unavailable</h1><p>{error}</p></section></main>;
  if (!invitation) return <main className="event-invite-page"><section className="event-invite-card"><p>Loading your event…</p></section></main>;

  const authHref = buildAuthHref({ eventInviteToken: token, email: invitation.email });
  const cancelled = invitation.event.status === "cancelled";
  return (
    <main className="event-invite-page">
      <section className="event-invite-card">
        <p className="event-invite-kicker">{cancelled ? "Event cancelled" : "You’re invited"}</p>
        <h1>{invitation.event.title}</h1>
        <p className="event-invite-when">{eventWhen(invitation)}</p>
        {invitation.event.location ? <p>{invitation.event.location}</p> : null}
        {cancelled ? <p className="event-invite-error">This event has been cancelled. Your private notes and captures have not been deleted.</p> : (
          <>
            <div className="event-invite-actions" aria-label="Your RSVP">
              <button disabled={saving} data-active={invitation.status === "going"} onClick={() => void respond("going")}>Going</button>
              <button disabled={saving} data-active={invitation.status === "not_going"} onClick={() => void respond("not_going")}>Not going</button>
            </div>
            {invitation.status !== "invited" ? <p className="event-invite-saved">Response saved. You can change it here at any time.</p> : null}
          </>
        )}
        <div className="event-invite-continuity">
          <strong>Keep this event with you</strong>
          <p>Create an account with {invitation.email}. Your RSVP will move with you, and anything you capture at the event can stay connected to the people and follow-ups it creates.</p>
          <a href={authHref}>Continue with this event</a>
        </div>
        <small>Opening this invitation never marks you as Going. Your private notes and captures are never visible to the organiser or other attendees.</small>
        {error ? <p className="event-invite-error">{error}</p> : null}
      </section>
    </main>
  );
}
