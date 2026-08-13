import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyFollowUpTransition,
  canTransitionFollowUp,
  getFollowUpEffectiveState,
  isFollowUpReminderEligible,
  isFollowUpReviewGated,
  isFollowUpTerminal,
  isFutureSnoozeTarget,
} from "../lib/follow-up-lifecycle.ts";

describe("canTransitionFollowUp", () => {
  const allowed = {
    proposed: ["open", "dismissed", "cancelled"],
    open: ["snoozed", "completed", "dismissed", "cancelled"],
    snoozed: ["open", "completed", "dismissed", "cancelled"],
    completed: ["open"],
    dismissed: ["open"],
    cancelled: ["open"],
  };
  const allStatuses = Object.keys(allowed);

  it("allows every transition in the documented lifecycle table", () => {
    for (const [from, tos] of Object.entries(allowed)) {
      for (const to of tos) {
        assert.equal(canTransitionFollowUp(from, to), true, `${from} -> ${to} should be allowed`);
      }
    }
  });

  it("allows a same-status no-op from any status", () => {
    for (const status of allStatuses) {
      assert.equal(canTransitionFollowUp(status, status), true, `${status} -> ${status} should be a no-op`);
    }
  });

  it("rejects every transition not documented in the lifecycle table", () => {
    for (const from of allStatuses) {
      for (const to of allStatuses) {
        if (from === to || allowed[from].includes(to)) continue;
        assert.equal(canTransitionFollowUp(from, to), false, `${from} -> ${to} should be rejected`);
      }
    }
  });

  it("specifically rejects a proposed follow-up jumping straight to completed", () => {
    assert.equal(canTransitionFollowUp("proposed", "completed"), false);
  });

  it("specifically rejects a terminal follow-up moving to anything but open", () => {
    for (const from of ["completed", "dismissed", "cancelled"]) {
      for (const to of ["snoozed", "proposed", "dismissed", "cancelled"]) {
        if (from === to) continue;
        assert.equal(canTransitionFollowUp(from, to), false, `${from} -> ${to} should be rejected`);
      }
    }
  });
});

describe("applyFollowUpTransition", () => {
  it("throws on an invalid transition instead of silently applying it", () => {
    assert.throws(() => applyFollowUpTransition({ status: "proposed" }, "completed"));
  });

  it("stamps completedAt and clears the other lifecycle timestamps when completing", () => {
    const next = applyFollowUpTransition(
      { status: "snoozed", snoozedUntil: "2026-09-01T00:00:00.000Z", dismissedAt: "2026-01-01T00:00:00.000Z" },
      "completed",
      "2026-08-10T12:00:00.000Z",
    );
    assert.equal(next.status, "completed");
    assert.equal(next.completedAt, "2026-08-10T12:00:00.000Z");
    assert.equal(next.snoozedUntil, undefined);
    assert.equal(next.dismissedAt, undefined);
    assert.equal(next.statusUpdatedAt, "2026-08-10T12:00:00.000Z");
  });

  it("carries the snoozedUntil argument through only when moving to snoozed", () => {
    const next = applyFollowUpTransition(
      { status: "open" },
      "snoozed",
      "2026-08-10T12:00:00.000Z",
      "2026-08-15T09:00:00.000Z",
    );
    assert.equal(next.snoozedUntil, "2026-08-15T09:00:00.000Z");
  });

  it("does not bump statusUpdatedAt on a same-status no-op", () => {
    const next = applyFollowUpTransition(
      { status: "open", statusUpdatedAt: "2026-01-01T00:00:00.000Z" },
      "open",
      "2026-08-10T12:00:00.000Z",
    );
    assert.equal(next.statusUpdatedAt, "2026-01-01T00:00:00.000Z");
  });
});

describe("isFollowUpReviewGated", () => {
  it("gates a proposed action while its encounter is still a draft", () => {
    assert.equal(isFollowUpReviewGated("draft", "proposed"), true);
  });

  it("does not gate a proposed action once the encounter leaves draft", () => {
    assert.equal(isFollowUpReviewGated("reviewed", "proposed"), false);
    assert.equal(isFollowUpReviewGated("shared", "proposed"), false);
  });

  it("does not gate an already-activated action even inside a draft encounter", () => {
    assert.equal(isFollowUpReviewGated("draft", "open"), false);
    assert.equal(isFollowUpReviewGated("draft", "completed"), false);
  });
});

describe("isFutureSnoozeTarget", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");

  it("accepts a timestamp in the future", () => {
    assert.equal(isFutureSnoozeTarget("2026-08-11T00:00:00.000Z", now), true);
  });

  it("rejects a timestamp in the past", () => {
    assert.equal(isFutureSnoozeTarget("2026-08-09T00:00:00.000Z", now), false);
  });

  it("rejects the current instant (must be strictly future)", () => {
    assert.equal(isFutureSnoozeTarget("2026-08-10T12:00:00.000Z", now), false);
  });

  it("rejects missing or unparseable input", () => {
    assert.equal(isFutureSnoozeTarget(undefined, now), false);
    assert.equal(isFutureSnoozeTarget("not-a-date", now), false);
  });
});

describe("isFollowUpTerminal", () => {
  it("treats completed, dismissed, and cancelled as terminal", () => {
    assert.equal(isFollowUpTerminal("completed"), true);
    assert.equal(isFollowUpTerminal("dismissed"), true);
    assert.equal(isFollowUpTerminal("cancelled"), true);
  });

  it("treats proposed, open, and snoozed as non-terminal", () => {
    assert.equal(isFollowUpTerminal("proposed"), false);
    assert.equal(isFollowUpTerminal("open"), false);
    assert.equal(isFollowUpTerminal("snoozed"), false);
  });
});

describe("reminder eligibility", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");

  it("excludes a proposed (unreviewed) action", () => {
    assert.equal(getFollowUpEffectiveState({ status: "proposed" }, now), "proposed");
    assert.equal(isFollowUpReminderEligible({ status: "proposed" }, now), false);
  });

  it("excludes terminal actions", () => {
    for (const status of ["completed", "dismissed", "cancelled"]) {
      assert.equal(isFollowUpReminderEligible({ status }, now), false);
    }
  });

  it("excludes a snoozed action whose wake time has not arrived", () => {
    const action = { status: "snoozed", snoozedUntil: "2026-08-11T00:00:00.000Z" };
    assert.equal(getFollowUpEffectiveState(action, now), "snoozed");
    assert.equal(isFollowUpReminderEligible(action, now), false);
  });

  it("falls back to due-date evaluation once a snooze has elapsed", () => {
    const action = { status: "snoozed", snoozedUntil: "2026-08-09T00:00:00.000Z", dueAt: "2026-08-01" };
    assert.equal(getFollowUpEffectiveState(action, now), "overdue");
    assert.equal(isFollowUpReminderEligible(action, now), true);
  });

  it("includes an open action with no due date", () => {
    assert.equal(isFollowUpReminderEligible({ status: "open" }, now), true);
  });

  it("includes due-today and overdue open actions", () => {
    assert.equal(getFollowUpEffectiveState({ status: "open", dueAt: "2026-08-10" }, now), "due");
    assert.equal(getFollowUpEffectiveState({ status: "open", dueAt: "2026-08-01" }, now), "overdue");
    assert.equal(isFollowUpReminderEligible({ status: "open", dueAt: "2026-08-01" }, now), true);
  });

  it("includes a scheduled (future due date) open action", () => {
    const action = { status: "open", dueAt: "2026-09-01" };
    assert.equal(getFollowUpEffectiveState(action, now), "scheduled");
    assert.equal(isFollowUpReminderEligible(action, now), true);
  });
});
