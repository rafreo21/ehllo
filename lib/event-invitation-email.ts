export function buildEventInvitationEmail(input: {
  eventTitle: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string;
  guestUrl: string;
}) {
  const start = new Date(input.startsAt);
  const when = Number.isNaN(start.getTime())
    ? "Date and time to be confirmed"
    : start.toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/London" });
  const title = input.eventTitle.trim() || "Event invitation";
  return {
    subject: `You’re invited: ${title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#163300;line-height:1.55">
        <p style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#687764">Event invitation</p>
        <h1 style="font-size:34px;line-height:1.1;margin:12px 0">${escapeHtml(title)}</h1>
        <p><strong>${escapeHtml(when)}</strong>${input.location?.trim() ? `<br>${escapeHtml(input.location.trim())}` : ""}</p>
        <p>View the event and choose Going or Not going. Opening the invitation will not RSVP for you.</p>
        <p style="margin:28px 0"><a href="${escapeHtml(input.guestUrl)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#163300;color:white;text-decoration:none;font-weight:700">View event</a></p>
        <p style="font-size:13px;color:#687764">AfterMeet keeps the event connected to the people you meet, your private captures and the follow-ups you choose. Organisers and attendees cannot see your private notes.</p>
      </div>`,
  };
}

export function buildEventScheduleChangedEmail(input: {
  eventTitle: string;
  startsAt: string;
  location?: string;
}) {
  const when = formatEventTime(input.startsAt);
  const title = input.eventTitle.trim() || "Your event";
  return {
    subject: `Updated event: ${title}`,
    html: emailFrame("Event updated", title, `The event is now scheduled for <strong>${escapeHtml(when)}</strong>${input.location?.trim() ? `<br>Location: ${escapeHtml(input.location.trim())}` : ""}. Your RSVP has been kept.`, "Open your original AfterMeet invitation if you want to change your response."),
  };
}

export function buildEventCancelledEmail(eventTitle: string) {
  const title = eventTitle.trim() || "Your event";
  return {
    subject: `Cancelled: ${title}`,
    html: emailFrame("Event cancelled", title, "This event has been cancelled. You do not need to take any action.", "Your private notes and captures remain private and are not deleted."),
  };
}

export function buildEventReminderEmail(input: { eventTitle: string; startsAt: string; location?: string }) {
  const title = input.eventTitle.trim() || "Your event";
  const when = formatEventTime(input.startsAt);
  return {
    subject: `Coming up: ${title}`,
    html: emailFrame("Event reminder", title, `<strong>${escapeHtml(when)}</strong>${input.location?.trim() ? `<br>${escapeHtml(input.location.trim())}` : ""}`, "Use your original invitation if you need to change your RSVP."),
  };
}

function formatEventTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "a new time to be confirmed"
    : date.toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/London" });
}

function emailFrame(kicker: string, title: string, content: string, footer: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#163300;line-height:1.55">
    <p style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#687764">${escapeHtml(kicker)}</p>
    <h1 style="font-size:34px;line-height:1.1;margin:12px 0">${escapeHtml(title)}</h1>
    <p>${content}</p><p style="font-size:13px;color:#687764">${escapeHtml(footer)}</p>
  </div>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] || character);
}
