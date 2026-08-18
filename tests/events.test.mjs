import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  candidateSuppressionKey,
  externalAttendeeCount,
  isEventCandidateWorthy,
  isVirtualLocation,
  resolveCurrentEvent,
} from "../lib/events.ts";

describe("isVirtualLocation", () => {
  it("recognizes common video-call links", () => {
    assert.equal(isVirtualLocation("https://zoom.us/j/123456"), true);
    assert.equal(isVirtualLocation("https://meet.google.com/abc-defg-hij"), true);
    assert.equal(isVirtualLocation("https://teams.microsoft.com/l/meetup-join/xyz"), true);
  });

  it("treats a physical address as non-virtual", () => {
    assert.equal(isVirtualLocation("ExCeL London, Royal Victoria Dock"), false);
  });

  it("treats an empty location as non-virtual", () => {
    assert.equal(isVirtualLocation(""), false);
    assert.equal(isVirtualLocation("   "), false);
  });
});

describe("externalAttendeeCount", () => {
  it("counts attendees outside the user's own domain", () => {
    const count = externalAttendeeCount(
      ["me@aftermeet.app", "colleague@aftermeet.app", "sarah@example.com", "james@other.com"],
      "me@aftermeet.app",
    );
    assert.equal(count, 2);
  });

  it("dedupes repeated external addresses case-insensitively", () => {
    const count = externalAttendeeCount(["Sarah@Example.com", "sarah@example.com"], "me@aftermeet.app");
    assert.equal(count, 1);
  });

  it("returns 0 when the user's own email has no domain", () => {
    assert.equal(externalAttendeeCount(["sarah@example.com"], "not-an-email"), 0);
  });
});

const baseCandidate = {
  startsAt: "2026-08-10T14:00:00.000Z",
  endsAt: "2026-08-10T16:00:00.000Z",
  location: "ExCeL London",
  attendeeEmails: ["sarah@example.com"],
  userEmail: "me@aftermeet.app",
  isRecurring: false,
};

describe("isEventCandidateWorthy", () => {
  it("accepts a one-time, external-attendee, physical-location meeting", () => {
    assert.equal(isEventCandidateWorthy(baseCandidate), true);
  });

  it("rejects a recurring event regardless of other signals", () => {
    assert.equal(isEventCandidateWorthy({ ...baseCandidate, isRecurring: true }), false);
  });

  it("rejects an event shorter than the duration floor", () => {
    assert.equal(isEventCandidateWorthy({
      ...baseCandidate,
      endsAt: "2026-08-10T14:20:00.000Z",
    }), false);
  });

  it("accepts an event with only internal attendees", () => {
    assert.equal(isEventCandidateWorthy({
      ...baseCandidate,
      attendeeEmails: ["colleague@aftermeet.app"],
    }), true);
  });

  it("accepts a bare self-added block with no attendees at all - a real event can be added by hand, not just invited to", () => {
    assert.equal(isEventCandidateWorthy({
      ...baseCandidate,
      attendeeEmails: [],
    }), true);
  });

  it("accepts a video-call meeting the same as a physical one", () => {
    assert.equal(isEventCandidateWorthy({
      ...baseCandidate,
      location: "https://zoom.us/j/123456",
      attendeeEmails: ["sarah@example.com"],
    }), true);
  });

  it("rejects malformed start/end timestamps", () => {
    assert.equal(isEventCandidateWorthy({ ...baseCandidate, endsAt: "not-a-date" }), false);
    assert.equal(isEventCandidateWorthy({ ...baseCandidate, startsAt: "2026-08-10T16:00:00.000Z", endsAt: "2026-08-10T14:00:00.000Z" }), false);
  });
});

describe("resolveCurrentEvent", () => {
  const now = new Date("2026-08-10T15:00:00.000Z");

  it("returns the single going-event whose window contains now", () => {
    const id = resolveCurrentEvent([
      { id: "product-con", startsAt: "2026-08-10T14:00:00.000Z", endsAt: "2026-08-10T18:00:00.000Z" },
    ], now);
    assert.equal(id, "product-con");
  });

  it("returns null when no going-event window contains now", () => {
    const id = resolveCurrentEvent([
      { id: "product-con", startsAt: "2026-08-11T14:00:00.000Z", endsAt: "2026-08-11T18:00:00.000Z" },
    ], now);
    assert.equal(id, null);
  });

  it("on an overlap, picks whichever going-event started most recently", () => {
    const id = resolveCurrentEvent([
      { id: "product-con", startsAt: "2026-08-10T14:00:00.000Z", endsAt: "2026-08-10T18:00:00.000Z" },
      { id: "founders-mixer", startsAt: "2026-08-10T14:30:00.000Z", endsAt: "2026-08-10T20:00:00.000Z" },
    ], now);
    assert.equal(id, "founders-mixer");
  });

  it("respects leftAt, excluding an event the user has already left", () => {
    const id = resolveCurrentEvent([
      { id: "product-con", startsAt: "2026-08-10T14:00:00.000Z", endsAt: "2026-08-10T18:00:00.000Z", leftAt: "2026-08-10T14:45:00.000Z" },
    ], now);
    assert.equal(id, null);
  });

  it("still resolves an event the user has not yet left, even with leftAt set on a different one", () => {
    const id = resolveCurrentEvent([
      { id: "product-con", startsAt: "2026-08-10T14:00:00.000Z", endsAt: "2026-08-10T18:00:00.000Z", leftAt: "2026-08-10T14:45:00.000Z" },
      { id: "founders-mixer", startsAt: "2026-08-10T14:30:00.000Z", endsAt: "2026-08-10T20:00:00.000Z" },
    ], now);
    assert.equal(id, "founders-mixer");
  });

  it("applies a default 4-hour window to an event with no explicit end", () => {
    const withinDefault = resolveCurrentEvent([
      { id: "product-con", startsAt: "2026-08-10T14:00:00.000Z" },
    ], now);
    assert.equal(withinDefault, "product-con");

    const beyondDefault = resolveCurrentEvent([
      { id: "product-con", startsAt: "2026-08-10T14:00:00.000Z" },
    ], new Date("2026-08-10T19:00:00.000Z"));
    assert.equal(beyondDefault, null);
  });

  it("uses the default window when legacy event data has an end before its start", () => {
    const current = resolveCurrentEvent([
      { id: "legacy-broken-end", startsAt: "2026-08-10T14:00:00.000Z", endsAt: "2025-08-10T18:00:00.000Z" },
    ], new Date("2026-08-10T15:00:00.000Z"));
    assert.equal(current, "legacy-broken-end");
  });
});

describe("candidateSuppressionKey", () => {
  it("normalizes case and whitespace so the same candidate always keys the same", () => {
    assert.equal(
      candidateSuppressionKey(" Organizer@Example.com ", "  Weekly Sync ", "2026-08-11T14:00:00Z"),
      candidateSuppressionKey("organizer@example.com", "weekly sync", "2026-08-11T14:00:00Z"),
    );
  });

  it("differs for different organizers or titles", () => {
    assert.notEqual(
      candidateSuppressionKey("a@example.com", "Weekly Sync", "2026-08-11T14:00:00Z"),
      candidateSuppressionKey("b@example.com", "Weekly Sync", "2026-08-11T14:00:00Z"),
    );
  });

  it("matches across different dates at the same time of day, catching a standing weekly block", () => {
    assert.equal(
      candidateSuppressionKey("a@example.com", "Dentist", "2026-08-11T14:00:00Z"),
      candidateSuppressionKey("a@example.com", "Dentist", "2026-08-25T14:05:00Z"),
    );
  });

  it("differs for the same organizer+title at an unrelated time of day, so declining one meeting doesn't blacklist every future meeting sharing its name", () => {
    assert.notEqual(
      candidateSuppressionKey("manager@example.com", "1:1", "2026-08-11T09:00:00Z"),
      candidateSuppressionKey("manager@example.com", "1:1", "2026-08-11T16:00:00Z"),
    );
  });
});


describe("resolveCurrentEvent with check-in", () => {
  const now = new Date("2026-09-04T14:00:00.000Z");
  // Two events overlapping the same afternoon - the case the clock cannot decide.
  const conference = { id: "conference", startsAt: "2026-09-04T09:00:00.000Z", endsAt: "2026-09-04T18:00:00.000Z", leftAt: null, checkedInAt: null };
  const meetup = { id: "meetup", startsAt: "2026-09-04T13:00:00.000Z", endsAt: "2026-09-04T17:00:00.000Z", leftAt: null, checkedInAt: null };

  it("falls back to the most recently started event when nobody has checked in", () => {
    assert.equal(resolveCurrentEvent([conference, meetup], now), "meetup");
  });

  it("lets an explicit check-in beat the later start time", () => {
    // Without check-in this returns "meetup"; the user says they are at the
    // conference, so scans and encounters must attribute there instead.
    const checkedIn = { ...conference, checkedInAt: "2026-09-04T09:15:00.000Z" };
    assert.equal(resolveCurrentEvent([checkedIn, meetup], now), "conference");
  });

  it("prefers the most recent check-in when the user moved between events", () => {
    const first = { ...conference, checkedInAt: "2026-09-04T09:15:00.000Z" };
    const second = { ...meetup, checkedInAt: "2026-09-04T13:30:00.000Z" };
    assert.equal(resolveCurrentEvent([first, second], now), "meetup");
  });

  it("ignores a check-in on an event whose window has already closed", () => {
    // A forgotten check-in must expire with its event rather than capturing
    // every later scan for the rest of the week.
    const yesterday = {
      id: "yesterday",
      startsAt: "2026-09-03T09:00:00.000Z",
      endsAt: "2026-09-03T18:00:00.000Z",
      leftAt: null,
      checkedInAt: "2026-09-03T09:10:00.000Z",
    };
    assert.equal(resolveCurrentEvent([yesterday, meetup], now), "meetup");
  });

  it("respects leaving an event you had checked into", () => {
    const left = { ...conference, checkedInAt: "2026-09-04T09:15:00.000Z", leftAt: "2026-09-04T12:00:00.000Z" };
    assert.equal(resolveCurrentEvent([left, meetup], now), "meetup");
  });

  it("ignores a check-in timestamped in the future", () => {
    const skewed = { ...conference, checkedInAt: "2026-09-04T16:00:00.000Z" };
    assert.equal(resolveCurrentEvent([skewed, meetup], now), "meetup");
  });
});


describe("early check-in grace", () => {
  const start = "2026-09-04T09:00:00.000Z";
  const end = "2026-09-04T18:00:00.000Z";
  const base = { id: "conference", startsAt: start, endsAt: end, leftAt: null, checkedInAt: null };

  it("does not treat an RSVP as presence before the event starts", () => {
    // Doors open at 09:00; at 08:30 an un-checked-in RSVP is still just an RSVP.
    assert.equal(resolveCurrentEvent([base], new Date("2026-09-04T08:30:00.000Z")), null);
  });

  it("counts an explicit check-in made before the scheduled start", () => {
    // Arriving early and meeting someone in the queue should file to the event
    // you are standing at.
    const early = { ...base, checkedInAt: "2026-09-04T08:20:00.000Z" };
    assert.equal(resolveCurrentEvent([early], new Date("2026-09-04T08:30:00.000Z")), "conference");
  });

  it("does not let the grace reach back further than an hour", () => {
    const early = { ...base, checkedInAt: "2026-09-04T07:00:00.000Z" };
    assert.equal(resolveCurrentEvent([early], new Date("2026-09-04T07:30:00.000Z")), null);
  });
});


describe("one place at a time, over time", () => {
  const conference = { id: "conference", startsAt: "2026-09-04T09:00:00.000Z", endsAt: "2026-09-04T18:00:00.000Z", leftAt: null, checkedInAt: null };
  const meetup = { id: "meetup", startsAt: "2026-09-04T13:00:00.000Z", endsAt: "2026-09-04T17:00:00.000Z", leftAt: null, checkedInAt: null };

  it("does not hand you back to an event you walked out of", () => {
    // 09:00 at the conference, 13:05 you walk to the meetup. Moving records
    // leaving, so when the meetup ends at 17:00 the still-running conference
    // must not silently reclaim you.
    const walkedOut = { ...conference, checkedInAt: null, leftAt: "2026-09-04T13:05:00.000Z" };
    const nowAt = { ...meetup, checkedInAt: "2026-09-04T13:05:00.000Z" };

    assert.equal(resolveCurrentEvent([walkedOut, nowAt], new Date("2026-09-04T14:00:00.000Z")), "meetup");
    assert.equal(resolveCurrentEvent([walkedOut, nowAt], new Date("2026-09-04T17:30:00.000Z")), null);
  });

  it("lets you go back to where you were", () => {
    // Checking in again clears the recorded departure, so returning works.
    const returned = { ...conference, leftAt: null, checkedInAt: "2026-09-04T17:20:00.000Z" };
    const ended = { ...meetup, checkedInAt: null, leftAt: "2026-09-04T17:20:00.000Z" };
    assert.equal(resolveCurrentEvent([returned, ended], new Date("2026-09-04T17:30:00.000Z")), "conference");
  });

  it("never reports two places at once", () => {
    // Even if two check-ins somehow coexist, exactly one answer comes back.
    const a = { ...conference, checkedInAt: "2026-09-04T09:10:00.000Z" };
    const b = { ...meetup, checkedInAt: "2026-09-04T13:10:00.000Z" };
    const at = resolveCurrentEvent([a, b], new Date("2026-09-04T14:00:00.000Z"));
    assert.equal(at, "meetup");
    assert.equal(typeof at, "string");
  });
});
