import assert from "node:assert/strict";
import test from "node:test";

import {
  encounterFromSharedPayload,
  normalizeEncounterActions,
} from "../lib/encounters.ts";

/** Exactly what get_shared_encounter returns for a participant: id and display name only. */
const GUEST_PARTICIPANT = { id: "p1", displayName: "Raf Reo" };

test("a guest participant without name or email does not crash the actions", () => {
  // This threw "Cannot read properties of undefined (reading 'trim')" and 500'd the whole
  // guest view, which the app then showed as "this meeting is not available" - a crash
  // wearing a permission decision's clothes.
  const actions = normalizeEncounterActions(
    [{ id: "a1", title: "Send the deck", participantId: "p1" }],
    [{ id: "p1" }],
    { name: "Raf Reo", email: "raf@example.com" },
  );
  assert.equal(actions.length, 1);
  assert.equal(actions[0].title, "Send the deck");
  // Falls through to the fallback person rather than exploding.
  assert.equal(actions[0].assigneeName, "Raf Reo");
  assert.equal(actions[0].assigneeEmail, "raf@example.com");
});

test("the shared payload maps displayName onto name instead of asserting it", () => {
  const encounter = encounterFromSharedPayload({
    id: "e1",
    title: "Lab Equipment",
    personName: "Raf Reo",
    personEmail: "raf@example.com",
    startedAt: "2026-08-20T10:00:00.000Z",
    participants: [GUEST_PARTICIPANT],
    actions: [{ id: "a1", title: "Send the deck", participantId: "p1" }],
  });

  assert.ok(encounter);
  assert.equal(encounter.participants.length, 1);
  assert.equal(encounter.participants[0].name, "Raf Reo");
  // Withheld by the guest payload on purpose - present as an empty string, never undefined,
  // so nothing downstream has to guard it again.
  assert.equal(encounter.participants[0].email, "");
  assert.equal(encounter.actions.length, 1);
});

test("a whole shared meeting with a participant and an action builds without throwing", () => {
  // The exact shape that took the guest view down: one participant, one action.
  assert.doesNotThrow(() => encounterFromSharedPayload({
    id: "e2",
    title: "Lab Equipment and Cold Room Inventory Alignment",
    personName: "rafreo",
    participants: [GUEST_PARTICIPANT],
    actions: [
      { id: "a1", title: "Schedule a meeting", participantId: "p1", owner: "guest" },
      { id: "a2", title: "Send the inventory", assigneeName: "rafreo" },
    ],
  }));
});

test("junk in the participants list is dropped rather than trusted", () => {
  const encounter = encounterFromSharedPayload({
    id: "e3",
    title: "Meeting",
    participants: [null, "nope", {}, { id: "ok", displayName: "Real Person" }],
    actions: [],
  });
  assert.equal(encounter.participants.length, 1);
  assert.equal(encounter.participants[0].id, "ok");
});
