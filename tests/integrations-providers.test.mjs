import test from "node:test";
import assert from "node:assert/strict";

import { buildPlainEmailRaw, parseScopes } from "../lib/integrations/email.ts";
import { allDayInstantIso, selectCalendarsToImport, shouldImportCalendar } from "../lib/events.ts";

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

// Only the primary calendar was read, so an event on a work or side calendar
// never arrived. Reading everything is wrong the other way: Google
// auto-subscribes accounts to Holidays and Birthdays.
test("shouldImportCalendar keeps primary and real shared calendars", () => {
  assert.equal(shouldImportCalendar({ id: "me@example.com", primary: true }), true);
  assert.equal(shouldImportCalendar({ id: "team@group.calendar.google.com", accessRole: "writer" }), true);
  assert.equal(shouldImportCalendar({ id: "readonly@group.calendar.google.com", accessRole: "reader" }), true);
});

test("shouldImportCalendar drops Google's generated calendars", () => {
  // The ".v." is what separates generated calendars from genuinely shared ones.
  assert.equal(shouldImportCalendar({ id: "en.uk#holiday@group.v.calendar.google.com", accessRole: "reader" }), false);
  assert.equal(shouldImportCalendar({ id: "addressbook#contacts@group.v.calendar.google.com", accessRole: "reader" }), false);
  assert.equal(shouldImportCalendar({ id: "#weeknum@group.v.calendar.google.com", accessRole: "reader" }), false);
});

test("shouldImportCalendar respects a calendar hidden in Google's own UI", () => {
  assert.equal(shouldImportCalendar({ id: "noisy@group.calendar.google.com", selected: false }), false);
  // ...but never at the cost of the primary calendar.
  assert.equal(shouldImportCalendar({ id: "me@example.com", primary: true, selected: false }), true);
});

test("shouldImportCalendar skips a grant that cannot read event details", () => {
  assert.equal(shouldImportCalendar({ id: "busy@group.calendar.google.com", accessRole: "freeBusyReader" }), false);
});

test("selectCalendarsToImport puts primary first so the cap never drops it", () => {
  const entries = [
    { id: "side@group.calendar.google.com", accessRole: "owner" },
    { id: "me@example.com", primary: true },
  ];
  assert.deepEqual(selectCalendarsToImport(entries), ["me@example.com", "side@group.calendar.google.com"]);
});

test("selectCalendarsToImport bounds how many calendars one sync reads", () => {
  const entries = Array.from({ length: 30 }, (_unused, index) => ({
    id: `cal${index}@group.calendar.google.com`,
    accessRole: "owner",
  }));
  assert.equal(selectCalendarsToImport(entries).length, 12);
  assert.equal(selectCalendarsToImport(entries, 3).length, 3);
});
