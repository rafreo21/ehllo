import assert from "node:assert/strict";
import test from "node:test";

import { hasActiveCloudRecording, isCloudRecordingExpired } from "../lib/recording-metadata.ts";
import { encounterFromSharedPayload } from "../lib/encounters.ts";

// --- Active vs. expired access -------------------------------------------

test("active access: a server recording with a future expiry is playable", () => {
  assert.equal(
    hasActiveCloudRecording({
      audioLocation: "server",
      storagePath: "workspace/encounter-1.m4a",
      cloudExpiresAt: "2026-12-01T00:00:00.000Z",
    }, Date.parse("2026-08-03T00:00:00.000Z")),
    true,
  );
});

test("expired access: playback and download are denied once cloudExpiresAt has passed", () => {
  const recording = {
    audioLocation: "server",
    storagePath: "workspace/encounter-1.m4a",
    cloudExpiresAt: "2026-08-01T00:00:00.000Z",
  };
  assert.equal(isCloudRecordingExpired(recording, Date.parse("2026-08-03T00:00:00.000Z")), true);
  assert.equal(hasActiveCloudRecording(recording, Date.parse("2026-08-03T00:00:00.000Z")), false);
});

// --- Disabled sharing -----------------------------------------------------

test("disabled access: turning off sharing (storagePath cleared) revokes access immediately, expiry notwithstanding", () => {
  assert.equal(
    hasActiveCloudRecording({
      audioLocation: "user_device",
      storagePath: "",
      cloudExpiresAt: "2026-12-01T00:00:00.000Z",
    }, Date.parse("2026-08-03T00:00:00.000Z")),
    false,
  );
});

// --- Missing storage object -------------------------------------------

test("missing object: no storagePath means no active access even with a future expiry", () => {
  assert.equal(
    hasActiveCloudRecording({
      audioLocation: "server",
      storagePath: undefined,
      cloudExpiresAt: "2026-12-01T00:00:00.000Z",
    }, Date.parse("2026-08-03T00:00:00.000Z")),
    false,
  );
});

// --- Repeated expiry job idempotency ---------------------------------------

test("repeated expiry job: re-evaluating an already-expired recording stays expired without error", () => {
  const recording = { audioLocation: "user_device", storagePath: "", cloudExpiresAt: "2026-08-01T00:00:00.000Z" };
  // Simulates the cron running twice in a row against the same (already
  // cleaned-up) row - both calls must agree, and neither should throw.
  assert.equal(hasActiveCloudRecording(recording, Date.parse("2026-08-03T00:00:00.000Z")), false);
  assert.equal(hasActiveCloudRecording(recording, Date.parse("2026-08-03T00:00:00.000Z")), false);
});

// --- Private-field exclusion from the guest-facing payload -----------------

test("private-field exclusion: the shared payload never carries transcript or private notes", () => {
  // Mirrors the exact shape get_shared_encounter() returns (see
  // supabase/migrations/202608011500_guest_follow_up_details.sql) - it has
  // no transcript/privateNotes keys at all, which is the actual boundary
  // that keeps them private. This guards the client mapper's contract with
  // that shape.
  const sharedPayload = {
    id: "encounter-1",
    title: "Coffee with Sarah",
    personName: "Sarah Chen",
    personEmail: "sarah@example.com",
    startedAt: "2026-08-01T09:00:00.000Z",
    endedAt: "2026-08-01T09:30:00.000Z",
    durationSeconds: 1800,
    consent: { confirmed: true, method: "verbal", confirmedAt: "2026-08-01T09:00:00.000Z" },
    sharedSummary: "Discussed the Q3 proposal.",
    actions: [],
    status: "shared",
    shareToken: "share-token-1",
    participants: [],
  };

  const encounter = encounterFromSharedPayload(sharedPayload);
  assert.ok(encounter);
  assert.equal(encounter.transcript, "");
  assert.equal(encounter.privateNotes, "");
  assert.equal(encounter.sharedSummary, "Discussed the Q3 proposal.");
});
