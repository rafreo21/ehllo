import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bucketEvents,
  canRejoinEvent,
  groupEventsForList,
  compareEventsByStart,
  isEventCurrentlyHappening,
  isUpcomingEvent,
  resolveHomeEventCardState,
} from "../mobile/src/features/events/event-home-state.ts";

function event(overrides = {}) {
  return {
    id: "event-1",
    title: "ProductCon London",
    location: "ExCeL London",
    startsAt: "2026-08-10T14:00:00.000Z",
    endsAt: "2026-08-10T18:00:00.000Z",
    source: "manual",
    sourceUrl: "",
    organizerEmail: "",
    status: "scheduled",
    attendanceStatus: "going",
    ...overrides,
  };
}

const now = new Date("2026-08-10T15:00:00.000Z");

describe("isEventCurrentlyHappening", () => {
  it("is true while now falls inside the event window", () => {
    assert.equal(isEventCurrentlyHappening(event(), now), true);
  });

  it("is false before the event starts or after it ends", () => {
    assert.equal(isEventCurrentlyHappening(event(), new Date("2026-08-10T13:00:00.000Z")), false);
    assert.equal(isEventCurrentlyHappening(event(), new Date("2026-08-10T19:00:00.000Z")), false);
  });

  it("applies a default 4-hour window when endsAt is missing", () => {
    const noEnd = event({ endsAt: null });
    assert.equal(isEventCurrentlyHappening(noEnd, new Date("2026-08-10T17:30:00.000Z")), true);
    assert.equal(isEventCurrentlyHappening(noEnd, new Date("2026-08-10T18:30:00.000Z")), false);
  });

  it("treats leftAt as an early cap on the window, not the scheduled end", () => {
    const leftEarly = event({ leftAt: "2026-08-10T15:30:00.000Z" });
    assert.equal(isEventCurrentlyHappening(leftEarly, new Date("2026-08-10T15:15:00.000Z")), true);
    assert.equal(isEventCurrentlyHappening(leftEarly, new Date("2026-08-10T15:45:00.000Z")), false);
  });
});

describe("isUpcomingEvent / bucketEvents", () => {
  it("treats an event that hasn't ended yet as upcoming, even if already in progress", () => {
    assert.equal(isUpcomingEvent(event(), now), true);
  });

  it("treats an ended event as past", () => {
    const ended = event({ startsAt: "2026-08-09T14:00:00.000Z", endsAt: "2026-08-09T18:00:00.000Z" });
    assert.equal(isUpcomingEvent(ended, now), false);
  });

  it("does not classify a future event as past when pasted metadata has an end before its start", () => {
    const futureWithBrokenEnd = event({
      startsAt: "2026-08-29T18:00:00.000Z",
      endsAt: "2026-08-09T22:00:00.000Z",
    });
    assert.equal(isUpcomingEvent(futureWithBrokenEnd, now), true);
  });

  it("splits and sorts upcoming (soonest first) and past (most recent first)", () => {
    const soon = event({ id: "soon", startsAt: "2026-08-11T09:00:00.000Z", endsAt: "2026-08-11T10:00:00.000Z" });
    const later = event({ id: "later", startsAt: "2026-08-12T09:00:00.000Z", endsAt: "2026-08-12T10:00:00.000Z" });
    const recentPast = event({ id: "recent-past", startsAt: "2026-08-09T09:00:00.000Z", endsAt: "2026-08-09T10:00:00.000Z" });
    const olderPast = event({ id: "older-past", startsAt: "2026-08-01T09:00:00.000Z", endsAt: "2026-08-01T10:00:00.000Z" });

    const { upcoming, past } = bucketEvents([later, olderPast, soon, recentPast], now);
    assert.deepEqual(upcoming.map((item) => item.id), ["soon", "later"]);
    assert.deepEqual(past.map((item) => item.id), ["recent-past", "older-past"]);
  });

  it("sorts by the actual timestamp rather than record insertion order or timezone text", () => {
    const newlyAddedLater = event({
      id: "newly-added-later",
      startsAt: "2026-08-11T10:00:00+01:00",
      createdAt: "2026-08-10T14:59:00.000Z",
    });
    const olderRecordSooner = event({
      id: "older-record-sooner",
      startsAt: "2026-08-11T08:30:00.000Z",
      createdAt: "2026-08-01T09:00:00.000Z",
    });

    assert.deepEqual(
      [newlyAddedLater, olderRecordSooner].sort(compareEventsByStart).map((item) => item.id),
      ["older-record-sooner", "newly-added-later"],
    );
  });
});

describe("resolveHomeEventCardState", () => {
  it("prefers an event happening right now over an upcoming one", () => {
    const current = event({ id: "current" });
    const upcoming = event({ id: "upcoming", startsAt: "2026-08-15T09:00:00.000Z", endsAt: "2026-08-15T10:00:00.000Z" });
    const state = resolveHomeEventCardState([upcoming, current], [], now);
    assert.equal(state.type, "current");
    assert.equal(state.event.id, "current");
  });

  it("on an overlap, picks whichever happening-now going-event started most recently", () => {
    const earlier = event({ id: "earlier", startsAt: "2026-08-10T13:00:00.000Z", endsAt: "2026-08-10T18:00:00.000Z" });
    const later = event({ id: "later", startsAt: "2026-08-10T14:30:00.000Z", endsAt: "2026-08-10T18:00:00.000Z" });
    const state = resolveHomeEventCardState([earlier, later], [], now);
    assert.equal(state.type, "current");
    assert.equal(state.event.id, "later");
  });

  it("falls back to the soonest upcoming going-event when nothing is happening now", () => {
    const later = event({ id: "later", startsAt: "2026-08-20T09:00:00.000Z", endsAt: "2026-08-20T10:00:00.000Z" });
    const soon = event({ id: "soon", startsAt: "2026-08-11T09:00:00.000Z", endsAt: "2026-08-11T10:00:00.000Z" });
    const state = resolveHomeEventCardState([later, soon], [], now);
    assert.equal(state.type, "upcoming");
    assert.equal(state.event.id, "soon");
  });

  it("falls back to a calendar candidate only when there is no going event at all", () => {
    const candidate = event({ id: "candidate", source: "calendar" });
    const state = resolveHomeEventCardState([], [candidate], now);
    assert.equal(state.type, "candidate");
    assert.equal(state.event.id, "candidate");
  });

  it("does not promote an expired candidate on Home", () => {
    const expired = event({
      id: "expired-candidate",
      startsAt: "2026-08-09T09:00:00.000Z",
      endsAt: "2026-08-09T10:00:00.000Z",
      source: "calendar",
    });
    assert.deepEqual(resolveHomeEventCardState([], [expired], now), { type: "none" });
  });

  it("returns none when there is nothing relevant", () => {
    assert.deepEqual(resolveHomeEventCardState([], [], now), { type: "none" });
  });
});


describe("groupEventsForList", () => {
  const now = new Date("2026-08-17T12:00:00.000Z");
  const future = { startsAt: "2026-08-20T09:00:00.000Z", endsAt: "2026-08-20T17:00:00.000Z" };
  const finished = { startsAt: "2026-08-10T09:00:00.000Z", endsAt: "2026-08-10T17:00:00.000Z" };

  it("keeps Upcoming strictly to going events that have not finished", () => {
    const groups = groupEventsForList([
      event({ id: "a", attendanceStatus: "going", ...future }),
      event({ id: "b", attendanceStatus: "going", ...finished }),
      event({ id: "c", attendanceStatus: "not_going", ...future }),
    ], now);

    assert.deepEqual(groups.upcoming.map((e) => e.id), ["a"]);
    assert.deepEqual(groups.past.attended.map((e) => e.id), ["b"]);
    assert.deepEqual(groups.past.notGoing.map((e) => e.id), ["c"]);
  });

  it("keeps a declined future event visible instead of dropping it", () => {
    // The defect this replaces: a not_going event was returned by nothing and
    // rendered nowhere, so there was no row left to change your mind on.
    const declined = event({ id: "declined", attendanceStatus: "not_going", ...future });
    const groups = groupEventsForList([declined], now);

    assert.equal(groups.past.notGoing.length, 1);
    assert.equal(canRejoinEvent(declined, now), true);
  });

  it("separates a declined event that has since finished", () => {
    const groups = groupEventsForList([
      event({ id: "missed", attendanceStatus: "not_going", ...finished }),
    ], now);

    assert.deepEqual(groups.past.didNotAttend.map((e) => e.id), ["missed"]);
    assert.deepEqual(groups.past.notGoing, []);
  });

  it("pulls cancelled events out of Upcoming even when the user said going", () => {
    const groups = groupEventsForList([
      event({ id: "off", attendanceStatus: "going", status: "cancelled", ...future }),
    ], now);

    assert.deepEqual(groups.upcoming, []);
    assert.deepEqual(groups.past.cancelled.map((e) => e.id), ["off"]);
  });

  it("offers rejoining only while the event can still be attended", () => {
    assert.equal(canRejoinEvent(event({ attendanceStatus: "not_going", ...future }), now), true);
    assert.equal(canRejoinEvent(event({ attendanceStatus: "not_going", ...finished }), now), false);
    assert.equal(canRejoinEvent(event({ attendanceStatus: "going", ...future }), now), false);
    assert.equal(
      canRejoinEvent(event({ attendanceStatus: "not_going", status: "cancelled", ...future }), now),
      false,
    );
  });

  it("orders not-going soonest-first and finished groups most-recent-first", () => {
    const groups = groupEventsForList([
      event({ id: "later", attendanceStatus: "not_going", startsAt: "2026-08-25T09:00:00.000Z", endsAt: null }),
      event({ id: "sooner", attendanceStatus: "not_going", startsAt: "2026-08-19T09:00:00.000Z", endsAt: null }),
      event({ id: "older", attendanceStatus: "going", startsAt: "2026-08-01T09:00:00.000Z", endsAt: "2026-08-01T10:00:00.000Z" }),
      event({ id: "recent", attendanceStatus: "going", startsAt: "2026-08-12T09:00:00.000Z", endsAt: "2026-08-12T10:00:00.000Z" }),
    ], now);

    assert.deepEqual(groups.past.notGoing.map((e) => e.id), ["sooner", "later"]);
    assert.deepEqual(groups.past.attended.map((e) => e.id), ["recent", "older"]);
  });
});
