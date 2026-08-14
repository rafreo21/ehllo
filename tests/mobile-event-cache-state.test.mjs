import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
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
