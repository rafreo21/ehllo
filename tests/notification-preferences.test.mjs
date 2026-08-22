import test from "node:test";
import assert from "node:assert/strict";

import { NOTIFICATION_TYPES, notificationTypeEnabled } from "../lib/notifications-server.ts";

// Saving preferences rebuilds the object from NOTIFICATION_TYPES. When that list
// lagged behind the types that existed, three toggles reverted on reload: they were
// simply not in the object being written back.
test("every notification type survives a preferences round-trip", () => {
  const allOn = Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, true]));
  const roundTripped = Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, notificationTypeEnabled(allOn, type)]),
  );
  assert.deepEqual(roundTripped, allOn);
});

test("a type switched off stays off, and does not drag the others with it", () => {
  const prefs = Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, true]));
  prefs.keep_in_touch = false;
  for (const type of NOTIFICATION_TYPES) {
    assert.equal(notificationTypeEnabled(prefs, type), type !== "keep_in_touch", type);
  }
});

test("the list covers every type the app actually dispatches", () => {
  // Named rather than counted. A hard-coded length fails whenever a type is added,
  // which teaches people to edit the number instead of checking the list - and the
  // bug this guards against was a list that lagged behind reality, not one that grew.
  for (const type of [
    "review_ready",
    "follow_up_due",
    "follow_up_overdue",
    "shared_meeting_update",
    "connection_added",
    "keep_in_touch",
    "contact_request",
    "follow_up_completed",
  ]) {
    assert.ok(NOTIFICATION_TYPES.includes(type), `${type} missing from NOTIFICATION_TYPES`);
  }
});

test("no type is listed twice", () => {
  assert.equal(new Set(NOTIFICATION_TYPES).size, NOTIFICATION_TYPES.length);
});
