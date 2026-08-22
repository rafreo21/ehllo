import test from "node:test";
import assert from "node:assert/strict";

import { shortenCardUrlForQr } from "../lib/apple-wallet-pass.ts";

// Those five characters are the difference between a 33x33 QR and a 29x29 one.
test("shortenCardUrlForQr drops the generated card- prefix", () => {
  assert.equal(
    shortenCardUrlForQr("https://staging.ehllo.io/c/card-51c26d952e7a4881"),
    "https://staging.ehllo.io/c/51c26d952e7a4881",
  );
});

test("shortenCardUrlForQr leaves a custom slug alone", () => {
  assert.equal(
    shortenCardUrlForQr("https://staging.ehllo.io/c/raphael"),
    "https://staging.ehllo.io/c/raphael",
  );
  // A slug that merely starts with "card-" but is not the generated 16-hex shape
  // must not be rewritten, or it would stop resolving.
  assert.equal(
    shortenCardUrlForQr("https://staging.ehllo.io/c/card-design-studio"),
    "https://staging.ehllo.io/c/card-design-studio",
  );
});

import { cardSlugCandidates } from "../lib/card-slug.ts";

// The pair that has to agree: whatever the QR drops, the resolver has to try adding
// back. These live in different files and would drift apart in silence otherwise.
test("a shortened wallet slug resolves back to the stored card", () => {
  const stored = "card-51c26d952e7a4881";
  const shortened = shortenCardUrlForQr(`https://staging.ehllo.io/c/${stored}`);
  const slugFromQr = new URL(shortened).pathname.replace("/c/", "");
  assert.ok(
    cardSlugCandidates(slugFromQr).includes(stored),
    "the prefixed form must be among the candidates, or a wallet scan cannot find the card",
  );
});

test("the slug as given is always tried first", () => {
  // A real card whose own slug happens to look like a bare code must win over a guess.
  assert.deepEqual(
    cardSlugCandidates("51c26d952e7a4881"),
    ["51c26d952e7a4881", "card-51c26d952e7a4881"],
  );
});

test("a custom slug gets no prefixed guess", () => {
  // Guessing "card-" onto someone's chosen slug could resolve to a different person.
  assert.deepEqual(cardSlugCandidates("raphael"), ["raphael"]);
  assert.deepEqual(cardSlugCandidates("design-studio"), ["design-studio"]);
  assert.deepEqual(cardSlugCandidates("card-design-studio"), ["card-design-studio"]);
  assert.deepEqual(cardSlugCandidates(""), []);
  assert.deepEqual(cardSlugCandidates(null), []);
});
