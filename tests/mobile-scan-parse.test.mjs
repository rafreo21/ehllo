import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalCardSlug,
  isSameEhlloEnvironment,
  parseEhlloCardFromUrl,
} from "../mobile/src/lib/parse-scanned-qr.ts";
import { shortenCardUrlForQr } from "../lib/apple-wallet-pass.ts";

describe("scanned card origin", () => {
  it("keeps the origin alongside the slug", () => {
    const parsed = parseEhlloCardFromUrl("https://ehllo.io/c/card-5f2fc4cc870b4a55");
    assert.equal(parsed.slug, "card-5f2fc4cc870b4a55");
    assert.equal(parsed.origin, "https://ehllo.io");
  });

  it("spots a production card scanned by the staging app", () => {
    // The real failure: this slug exists in production and has never existed
    // in staging, so the scan queued and retried a request that could not work.
    assert.equal(isSameEhlloEnvironment("https://ehllo.io", "https://staging.ehllo.io"), false);
  });

  it("accepts a card from the same environment", () => {
    assert.equal(isSameEhlloEnvironment("https://staging.ehllo.io", "https://staging.ehllo.io"), true);
  });

  it("does not block a scan when the environment cannot be determined", () => {
    assert.equal(isSameEhlloEnvironment("https://ehllo.io", ""), true);
  });
});

describe("canonical card slug", () => {
  it("treats the shortened wallet slug and the full slug as one card", () => {
    // The bug this exists for: a wallet QR carries the short form, every stored
    // connection carries the full one, and comparing them raw meant someone already
    // in your people list was registered again as a brand new connection.
    assert.equal(
      canonicalCardSlug("51c26d952e7a4881"),
      canonicalCardSlug("card-51c26d952e7a4881"),
    );
  });

  it("agrees with the rule the QR was shortened by", () => {
    // The two live in different packages and would otherwise drift apart silently.
    // Whatever shortenCardUrlForQr strips, canonicalCardSlug has to forgive.
    const full = "card-51c26d952e7a4881";
    const shortened = shortenCardUrlForQr(`https://staging.ehllo.io/c/${full}`);
    const slugFromQr = parseEhlloCardFromUrl(shortened).slug;
    assert.equal(canonicalCardSlug(slugFromQr), canonicalCardSlug(full));
  });

  it("leaves a custom slug alone, prefix or not", () => {
    // "card-design-studio" is somebody's chosen slug, not the generated 16-hex shape.
    // Stripping its prefix would collapse two different people onto one identity.
    assert.equal(canonicalCardSlug("card-design-studio"), "card-design-studio");
    assert.equal(canonicalCardSlug("raphael"), "raphael");
    assert.notEqual(canonicalCardSlug("card-design-studio"), canonicalCardSlug("design-studio"));
  });

  it("normalises case and whitespace, and survives nothing at all", () => {
    assert.equal(canonicalCardSlug("  CARD-51C26D952E7A4881 "), "51c26d952e7a4881");
    assert.equal(canonicalCardSlug(null), "");
    assert.equal(canonicalCardSlug(undefined), "");
  });
});
