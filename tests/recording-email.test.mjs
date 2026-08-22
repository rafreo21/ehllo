import test from "node:test";
import assert from "node:assert/strict";

import { buildRecordingShareEmail, recordingShareMailtoHref } from "../lib/recording-email.ts";

test("buildRecordingShareEmail includes guest link and attach reminder", () => {
  const email = buildRecordingShareEmail({
    title: "Product sync",
    personName: "Sarah Chen",
    personEmail: "sarah@example.com",
    guestUrl: "https://aftermeet.app/e/abc123",
    sharedSummary: "Agreed to send the deck by Friday.",
    meetingDate: "Mon, Jul 29, 2026",
    cloudExpired: true,
  });

  assert.match(email.subject, /Product sync/);
  assert.match(email.body, /Sarah/);
  assert.match(email.body, /https:\/\/aftermeet\.app\/e\/abc123/);
  assert.match(email.body, /Agreed to send the deck/);
  assert.match(email.body, /no longer available/);
  assert.match(email.body, /attach the meeting recording/i);
});

test("recordingShareMailtoHref encodes recipient and body", () => {
  const href = recordingShareMailtoHref({
    title: "Intro call",
    personName: "Alex",
    personEmail: "alex@example.com",
    guestUrl: "https://aftermeet.app/e/token",
  });

  assert.match(href, /^mailto:alex%40example\.com\?/);
  assert.match(href, /subject=/);
  assert.match(href, /body=/);
  assert.doesNotMatch(href, /\+/);
  assert.match(href, /Intro%20call/);
});
