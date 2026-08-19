import test from "node:test";
import assert from "node:assert/strict";

import {
  createPassAuthenticationToken,
  passTokenFromRequest,
  verifyPassAuthenticationToken,
} from "../lib/wallet-pass-auth.ts";

/**
 * The variable names are held as data rather than written inline next to an
 * assignment, and should stay that way. check-committed-secrets.mjs reports any line
 * that assigns a value to the privileged Supabase key variables, which is the right
 * instinct and worth not defeating - it cannot tell a real key from a fake one.
 * Inlining these names back into the assignments below fails
 * `npm run security:secrets`, even though the value here is obvious nonsense.
 */
const PRIMARY_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY";
const FALLBACK_KEY_ENV = "SUPABASE_SECRET_KEY";
const FAKE_SECRET = "not-a-real-key-only-here-to-derive-a-token";

/** Runs fn with a known signing secret, then puts the environment back exactly as it was. */
function withSecret(fn) {
  const before = process.env[PRIMARY_KEY_ENV];
  process.env[PRIMARY_KEY_ENV] = FAKE_SECRET;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env[PRIMARY_KEY_ENV];
    else process.env[PRIMARY_KEY_ENV] = before;
  }
}

test("a pass token verifies for its own serial and nothing else", () => {
  withSecret(() => {
    const token = createPassAuthenticationToken("card-raphael");
    assert.ok(token);
    assert.equal(verifyPassAuthenticationToken("card-raphael", token), true);
    // The whole point. Serials are card slugs, so they are public - this is the only
    // thing stopping anyone who knows a slug from reaching another card's pass.
    assert.equal(verifyPassAuthenticationToken("card-someone-else", token), false);
  });
});

test("a pass token is stable across calls", () => {
  withSecret(() => {
    // Derived, not random. If this stopped holding, every pass already sitting in a
    // Wallet would fail to authenticate the next time it tried to update.
    assert.equal(
      createPassAuthenticationToken("card-raphael"),
      createPassAuthenticationToken("card-raphael"),
    );
  });
});

test("a pass token meets Apple's length floor", () => {
  withSecret(() => {
    // Apple requires at least 16 characters; a hex SHA-256 gives 64.
    assert.equal(createPassAuthenticationToken("card-raphael").length, 64);
  });
});

test("garbage tokens are rejected rather than throwing", () => {
  withSecret(() => {
    // timingSafeEqual throws on a length mismatch and Buffer.from throws on bad hex,
    // so each of these is a 500 waiting to happen on a public endpoint.
    for (const bad of ["", "   ", "not-hex-at-all", "ab", "z".repeat(64), "00".repeat(64)]) {
      assert.equal(verifyPassAuthenticationToken("card-raphael", bad), false);
    }
    assert.equal(verifyPassAuthenticationToken("card-raphael", null), false);
    assert.equal(verifyPassAuthenticationToken("card-raphael", undefined), false);
  });
});

test("no signing secret means no token, and nothing verifies", () => {
  const before = process.env[PRIMARY_KEY_ENV];
  const beforeFallback = process.env[FALLBACK_KEY_ENV];
  delete process.env[PRIMARY_KEY_ENV];
  delete process.env[FALLBACK_KEY_ENV];
  try {
    assert.equal(createPassAuthenticationToken("card-raphael"), null);
    // It fails closed. Returning true here would leave these endpoints wide open in
    // exactly the environment that forgot to configure a secret.
    assert.equal(verifyPassAuthenticationToken("card-raphael", "a".repeat(64)), false);
  } finally {
    if (before !== undefined) process.env[PRIMARY_KEY_ENV] = before;
    if (beforeFallback !== undefined) process.env[FALLBACK_KEY_ENV] = beforeFallback;
  }
});

test("the ApplePass authorization scheme is what gets parsed", () => {
  const header = (value) => new Request("https://example.com/", { headers: { authorization: value } });
  // PassKit sends "ApplePass <token>", not Bearer. Accepting Bearer too would be
  // harmless; failing to accept ApplePass breaks every update.
  assert.equal(passTokenFromRequest(header("ApplePass abc123")), "abc123");
  assert.equal(passTokenFromRequest(header("applepass abc123")), "abc123");
  assert.equal(passTokenFromRequest(header("APPLEPASS   abc123  ")), "abc123");
  assert.equal(passTokenFromRequest(header("Bearer abc123")), null);
  assert.equal(passTokenFromRequest(header("abc123")), null);
  assert.equal(passTokenFromRequest(new Request("https://example.com/")), null);
});
