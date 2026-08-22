import assert from "node:assert/strict";
import test from "node:test";

import {
  hasPkceVerifier,
  mergeRequestCookies,
  parseCookieHeader,
} from "../lib/auth/request-cookies.ts";

test("parses and decodes raw request cookies without splitting encoded values", () => {
  assert.deepEqual(parseCookieHeader("theme=dark; pkce=hello%3Dworld%26again"), [
    { name: "theme", value: "dark" },
    { name: "pkce", value: "hello=world&again" },
  ]);
});

test("raw cookies fill gaps in an incomplete framework cookie collection", () => {
  const cookies = mergeRequestCookies(
    [{ name: "theme", value: "framework-value" }],
    "theme=raw-value; sb-project-auth-token-code-verifier=secret",
  );

  assert.deepEqual(cookies, [
    { name: "theme", value: "framework-value" },
    { name: "sb-project-auth-token-code-verifier", value: "secret" },
  ]);
  assert.equal(hasPkceVerifier(cookies), true);
});

test("detects chunked Supabase PKCE verifier cookies", () => {
  assert.equal(hasPkceVerifier([
    { name: "sb-project-auth-token-code-verifier.0", value: "chunk" },
  ]), true);
});
