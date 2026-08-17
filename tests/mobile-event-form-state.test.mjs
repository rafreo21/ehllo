import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyEventDateChange,
  resolveExtractedEventDates,
} from "../mobile/src/features/events/event-form-state.ts";

describe("mobile event date form", () => {
  it("requires review instead of trusting a pasted event date in the past", () => {
    const result = resolveExtractedEventDates({
      startsAt: "2025-07-12T10:00:00.000Z",
      endsAt: "2025-07-12T22:00:00.000Z",
    }, new Date("2026-08-13T09:00:00.000Z"));

    assert.equal(result.needsReview, true);
    // Deliberately unset rather than defaulted: guessing a start time for an
    // event whose link carries a stale year produces a confidently wrong date,
    // so the field stays empty and the notice asks for the real one.
    assert.equal(result.start, null);
    assert.equal(result.end, null);
    assert.match(result.notice, /past event date/i);
  });

  it("keeps a credible future date and duration from a pasted link", () => {
    const result = resolveExtractedEventDates({
      startsAt: "2026-08-29T10:00:00.000Z",
      endsAt: "2026-08-29T22:00:00.000Z",
    }, new Date("2026-08-13T09:00:00.000Z"));

    assert.equal(result.needsReview, false);
    assert.equal(result.start.toISOString(), "2026-08-29T10:00:00.000Z");
    assert.equal(result.end?.toISOString(), "2026-08-29T22:00:00.000Z");
  });

  it("moves the extracted end by the same duration when the user corrects the start", () => {
    const result = applyEventDateChange({
      start: new Date("2025-07-12T10:00:00.000Z"),
      end: new Date("2025-07-12T22:00:00.000Z"),
    }, "start", new Date("2026-08-29T10:00:00.000Z"));

    assert.equal(result.start.toISOString(), "2026-08-29T10:00:00.000Z");
    assert.equal(result.end?.toISOString(), "2026-08-29T22:00:00.000Z");
  });
});
