import test from "node:test";
import assert from "node:assert/strict";

import { buildPlainEmailRaw, parseScopes } from "../lib/integrations/email.ts";
import { allDayInstantIso } from "../lib/events.ts";

test("buildPlainEmailRaw encodes a MIME message", () => {
  const raw = buildPlainEmailRaw("sarah@example.com", "Following up", "Hi Sarah,\n\nThanks again.");
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /To: sarah@example.com/);
  assert.match(decoded, /Subject: Following up/);
  assert.match(decoded, /Thanks again\./);
});

test("parseScopes splits oauth scope strings", () => {
  assert.deepEqual(parseScopes("Mail.Send Calendars.ReadWrite"), ["Mail.Send", "Calendars.ReadWrite"]);
});

// All-day entries were dropped outright, so a conference entered as a whole day
// never reached ehllo and nothing said why. Google sends these as a plain date
// with an exclusive end.
test("allDayInstantIso reads a plain calendar date as midnight UTC", () => {
  assert.equal(allDayInstantIso("2026-08-28"), "2026-08-28T00:00:00.000Z");
});

test("allDayInstantIso rejects anything that is not a plain date", () => {
  assert.equal(allDayInstantIso(undefined), "");
  assert.equal(allDayInstantIso(""), "");
  assert.equal(allDayInstantIso("2026-08-28T16:00:00Z"), "");
  assert.equal(allDayInstantIso("28/08/2026"), "");
});
