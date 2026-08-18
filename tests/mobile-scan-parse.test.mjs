import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isSameEhlloEnvironment,
  parseEhlloCardFromUrl,
} from "../mobile/src/lib/parse-scanned-qr.ts";

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
