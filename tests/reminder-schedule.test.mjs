import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_REMINDER_TIMES,
  effectiveReminderTimes,
  localDayKey,
  localMinutes,
  normalizeReminderTimes,
  OVERDUE_GRACE_HOURS,
  reminderDigestDue,
} from "../lib/reminder-schedule.ts";

const LONDON = "Europe/London";

test("only offered times survive, in the offered order", () => {
  assert.deepEqual(normalizeReminderTimes(["17:00", "09:00"]), ["09:00", "17:00"]);
  // Same preference either way round, so the earliest is always first.
  assert.deepEqual(normalizeReminderTimes(["09:00", "17:00"]), ["09:00", "17:00"]);
  assert.deepEqual(normalizeReminderTimes([" 12:00 "]), ["12:00"]);
  assert.deepEqual(normalizeReminderTimes(["03:00", "nonsense", 9, null]), []);
  assert.deepEqual(normalizeReminderTimes(null), []);
  // A duplicate is one choice, not two.
  assert.deepEqual(normalizeReminderTimes(["09:00", "09:00"]), ["09:00"]);
});

test("nothing chosen falls back to the default rather than to nothing", () => {
  assert.deepEqual(effectiveReminderTimes(null), DEFAULT_REMINDER_TIMES);
  assert.deepEqual(effectiveReminderTimes([]), DEFAULT_REMINDER_TIMES);
  // This is what stops the digest silently ceasing for accounts predating the setting.
  assert.ok(effectiveReminderTimes(["garbage"]).length > 0);
});

test("the local day is the user's day, not the server's", () => {
  // 23:30 UTC on the 19th is already the 20th in Auckland. Using the server's midnight
  // is what let the once-a-day promise slip for anyone not living in UTC.
  const at = new Date("2026-08-19T23:30:00Z");
  assert.equal(localDayKey(at, "UTC"), "2026-08-19");
  assert.equal(localDayKey(at, "Pacific/Auckland"), "2026-08-20");
  assert.equal(localDayKey(at, "America/Los_Angeles"), "2026-08-19");
});

test("an unrecognised zone falls back rather than throwing", () => {
  const at = new Date("2026-08-20T12:00:00Z");
  assert.equal(localDayKey(at, "Not/AZone"), "2026-08-20");
  assert.equal(localMinutes(at, "Not/AZone"), 12 * 60);
});

test("local minutes follow daylight saving without a table to maintain", () => {
  // British Summer Time: 14:00 UTC is 15:00 in London.
  assert.equal(localMinutes(new Date("2026-08-20T14:00:00Z"), LONDON), 15 * 60);
  // And in January it is not.
  assert.equal(localMinutes(new Date("2026-01-20T14:00:00Z"), LONDON), 14 * 60);
});

test("midnight is minute zero, not a day later", () => {
  assert.equal(localMinutes(new Date("2026-08-20T00:00:00Z"), "UTC"), 0);
});

test("never sent waits for the first chosen time, then goes", () => {
  const early = reminderDigestDue({
    now: new Date("2026-08-20T06:00:00Z"), // 07:00 London
    timeZone: LONDON,
    reminderTimes: ["09:00"],
    lastSentAt: null,
  });
  assert.equal(early.due, false);
  assert.equal(early.reason, "before-first-time");

  const later = reminderDigestDue({
    now: new Date("2026-08-20T09:00:00Z"), // 10:00 London
    timeZone: LONDON,
    reminderTimes: ["09:00"],
    lastSentAt: null,
  });
  assert.equal(later.due, true);
  assert.equal(later.reason, "never-sent");
});

test("the fixed-hour digest no longer reaches somebody who chose a later time", () => {
  // This is the reported bug: the cron runs at 14:00 UTC, which is 15:00 in London, and
  // it used to send to everybody regardless of what they had picked.
  const cronRun = new Date("2026-08-20T14:00:00Z");
  const chose17 = reminderDigestDue({
    now: cronRun, timeZone: LONDON, reminderTimes: ["17:00"], lastSentAt: "2026-08-19T14:05:00Z",
  });
  assert.equal(chose17.due, false);
  assert.equal(chose17.reason, "before-first-time");

  // Whereas somebody who chose 09:00 is due, because their hour has been and gone.
  const chose09 = reminderDigestDue({
    now: cronRun, timeZone: LONDON, reminderTimes: ["09:00"], lastSentAt: "2026-08-19T14:05:00Z",
  });
  assert.equal(chose09.due, true);
});

test("twice in one local day never happens", () => {
  const result = reminderDigestDue({
    now: new Date("2026-08-20T18:00:00Z"),
    timeZone: LONDON,
    reminderTimes: ["09:00", "17:00"],
    lastSentAt: "2026-08-20T09:05:00Z",
  });
  assert.equal(result.due, false);
  assert.equal(result.reason, "already-today");
});

test("a preference is never honoured so faithfully that the reminder stops", () => {
  // 17:00 chosen, cron only ever awake at 15:00 local. Without the grace window this
  // person would qualify on no run, ever - a setting that silences the feature.
  const stale = new Date("2026-08-22T14:00:00Z");
  const lastSent = new Date(stale.getTime() - (OVERDUE_GRACE_HOURS + 1) * 3_600_000).toISOString();
  const result = reminderDigestDue({
    now: stale, timeZone: LONDON, reminderTimes: ["17:00"], lastSentAt: lastSent,
  });
  assert.equal(result.due, true);
  assert.equal(result.reason, "overdue");
});

test("the grace window does not fire a day early", () => {
  const now = new Date("2026-08-21T14:00:00Z");
  const lastSent = new Date(now.getTime() - 20 * 3_600_000).toISOString();
  const result = reminderDigestDue({
    now, timeZone: LONDON, reminderTimes: ["17:00"], lastSentAt: lastSent,
  });
  assert.equal(result.due, false);
});

test("a corrupt last-sent value is treated as never sent, not as a reason to stay silent", () => {
  const result = reminderDigestDue({
    now: new Date("2026-08-20T14:00:00Z"),
    timeZone: LONDON,
    reminderTimes: ["09:00"],
    lastSentAt: "not a date",
  });
  assert.equal(result.due, true);
  assert.equal(result.reason, "never-sent");
});
