import assert from "node:assert/strict";
import test from "node:test";

import {
  groupContactRequests,
  MAX_REQUEST_GROUPS,
} from "../lib/contact-request-groups.ts";

function row(overrides) {
  return {
    id: "r1",
    field_type: "instagram",
    created_at: "2026-08-20T10:00:00.000Z",
    requester_user_id: "asker-1",
    workspace_id: "ws-1",
    follow_up_title: "",
    ...overrides,
  };
}

test("fifteen asks from one person for one detail become one group", () => {
  const rows = Array.from({ length: 15 }, (_, index) => row({
    id: `r${index}`,
    created_at: `2026-08-${String(20 - index).padStart(2, "0")}T10:00:00.000Z`,
  }));

  const groups = groupContactRequests(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 15);
  // Every id travels, because one answer has to clear all fifteen.
  assert.equal(groups[0].ids.length, 15);
  assert.equal(new Set(groups[0].ids).size, 15);
});

test("the newest row supplies the timestamp and the context", () => {
  const groups = groupContactRequests([
    row({ id: "new", created_at: "2026-08-20T10:00:00.000Z", follow_up_title: "Coffee on Thursday" }),
    row({ id: "old", created_at: "2026-01-01T10:00:00.000Z", follow_up_title: "Some conference" }),
  ]);
  assert.equal(groups[0].latestAt, "2026-08-20T10:00:00.000Z");
  assert.equal(groups[0].followUpTitle, "Coffee on Thursday");
});

test("the same person asking for two details is two groups", () => {
  const groups = groupContactRequests([
    row({ id: "a", field_type: "instagram" }),
    row({ id: "b", field_type: "phone" }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.fieldType).sort(), ["instagram", "phone"]);
});

test("two people asking for the same detail stay separate", () => {
  const groups = groupContactRequests([
    row({ id: "a", requester_user_id: "asker-1", workspace_id: "ws-1" }),
    row({ id: "b", requester_user_id: "asker-2", workspace_id: "ws-2" }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.workspaceId).sort(), ["ws-1", "ws-2"]);
});

test("requests with no requester collapse rather than pretending to be different people", () => {
  const groups = groupContactRequests([
    row({ id: "a", requester_user_id: null, workspace_id: null }),
    row({ id: "b", requester_user_id: null, workspace_id: null }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
});

test("one loud asker cannot push everybody else past the cap", () => {
  // This is the bug the grouping exists for: the old list capped raw rows at 20, so
  // these fifteen consumed fifteen slots and the other twenty-five people vanished.
  const loud = Array.from({ length: 15 }, (_, index) => row({
    id: `loud-${index}`,
    requester_user_id: "loud",
    workspace_id: "ws-loud",
  }));
  const others = Array.from({ length: 25 }, (_, index) => row({
    id: `other-${index}`,
    requester_user_id: `person-${index}`,
    workspace_id: `ws-${index}`,
  }));

  const groups = groupContactRequests([...loud, ...others]);
  assert.equal(groups.length, 26);

  const shown = groups.slice(0, MAX_REQUEST_GROUPS);
  assert.equal(shown.length, 20);
  // 19 distinct people beyond the loud one, not one person repeated nineteen times.
  assert.equal(new Set(shown.map((group) => group.key)).size, 20);
  assert.equal(Math.max(0, groups.length - shown.length), 6);
});

test("a blank follow-up title is empty rather than whitespace or null", () => {
  const groups = groupContactRequests([
    row({ follow_up_title: "   " }),
    row({ id: "b", requester_user_id: "asker-2", follow_up_title: null }),
  ]);
  assert.equal(groups[0].followUpTitle, "");
  assert.equal(groups[1].followUpTitle, "");
});
