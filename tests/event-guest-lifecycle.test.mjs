import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("event invitation claim qualifies pgcrypto under its restricted search path", () => {
  const migration = readFileSync(new URL("../supabase/migrations/202608132000_fix_event_invitation_digest_path.sql", import.meta.url), "utf8");
  assert.match(migration, /extensions\.digest\(trim\(p_token\)/);
  assert.match(migration, /invitation email does not match/);
});

test("staging E2E runner is guarded and always cleans up temporary users", () => {
  const runner = readFileSync(new URL("../scripts/e2e-staging.mjs", import.meta.url), "utf8");
  assert.match(runner, /AFTERMEET_E2E_STAGING/);
  assert.match(runner, /appUrl\.includes\("staging"\)/);
  assert.match(runner, /finally\s*{/);
  assert.match(runner, /admin\.auth\.admin\.deleteUser/);
  assert.match(runner, /temporary auth users are removed/);
});
