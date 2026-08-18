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
