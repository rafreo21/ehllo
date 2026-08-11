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

  it("rejects an event with no external attendees (internal-only)", () => {
    assert.equal(isEventCandidateWorthy({
      ...baseCandidate,
      attendeeEmails: ["colleague@aftermeet.app"],
    }), false);
  });

  it("accepts a video-call meeting with a single external attendee, same as a physical one", () => {
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
});

describe("candidateSuppressionKey", () => {
  it("normalizes case and whitespace so the same candidate always keys the same", () => {
    assert.equal(
      candidateSuppressionKey(" Organizer@Example.com ", "  Weekly Sync "),
      candidateSuppressionKey("organizer@example.com", "weekly sync"),
    );
  });

  it("differs for different organizers or titles", () => {
    assert.notEqual(
      candidateSuppressionKey("a@example.com", "Weekly Sync"),
      candidateSuppressionKey("b@example.com", "Weekly Sync"),
    );
  });
});
