import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyCachedCheckIn,
  applyCachedAttendance,
  applyCachedLeftAt,
} from "../mobile/src/features/events/event-cache-state.ts";

const event = {
  id: "event-1",
  title: "Connext x Ignite",
  location: "",
  startsAt: "2026-08-29T10:00:00.000Z",
  endsAt: "2026-08-29T22:00:00.000Z",
  source: "link",
  sourceUrl: "https://luma.com/kv2s9yn5",
  organizerEmail: "",
};

describe("offline event cache state", () => {
  it("adds an offline Going choice to the cache used by Capture", () => {
    assert.deepEqual(applyCachedAttendance([], event, "going"), [{ ...event, leftAt: null }]);
  });

  it("removes a Not going event from the Capture cache", () => {
    assert.deepEqual(applyCachedAttendance([event], event, "not_going"), []);
  });

  it("records I've left so later offline captures do not inherit the event", () => {
    const leftAt = "2026-08-29T18:00:00.000Z";
    assert.equal(applyCachedLeftAt([event], event.id, leftAt)[0].leftAt, leftAt);
  });
});


describe("applyCachedCheckIn", () => {
  const events = [
    { id: "a", title: "Conference", checkedInAt: null, leftAt: "2026-09-04T11:00:00.000Z" },
    { id: "b", title: "Meetup", checkedInAt: "2026-09-04T10:00:00.000Z", leftAt: null },
  ];

  it("records the check-in and clears a previous 'I've left' on the same event", () => {
    // Coming back should not require undoing "I've left" as a separate step.
    const next = applyCachedCheckIn(events, "a", "2026-09-04T12:00:00.000Z");
    const a = next.find((e) => e.id === "a");
    assert.equal(a.checkedInAt, "2026-09-04T12:00:00.000Z");
    assert.equal(a.leftAt, null);
  });

  it("clears every other check-in — you can only be in one place", () => {
    const next = applyCachedCheckIn(events, "a", "2026-09-04T12:00:00.000Z");
    assert.equal(next.find((e) => e.id === "b").checkedInAt, null);
  });

  it("withdrawing a check-in leaves other events untouched", () => {
    const next = applyCachedCheckIn(events, "b", null);
    assert.equal(next.find((e) => e.id === "b").checkedInAt, null);
    assert.equal(next.find((e) => e.id === "a").leftAt, "2026-09-04T11:00:00.000Z");
  });
});
