import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractEventInfoFromHtml } from "../lib/event-link-extraction.ts";

describe("extractEventInfoFromHtml", () => {
  it("reads title, location, and dates from a schema.org Event JSON-LD block", () => {
    const html = `
      <html><head>
        <title>Fallback title</title>
        <script type="application/ld+json">
          {"@type": "Event", "name": "ProductCon London", "startDate": "2026-08-10T14:00:00Z", "endDate": "2026-08-10T18:00:00Z", "location": {"name": "ExCeL London"}}
        </script>
      </head></html>
    `;
    const result = extractEventInfoFromHtml(html);
    assert.equal(result.title, "ProductCon London");
    assert.equal(result.location, "ExCeL London");
    assert.equal(result.startsAt, "2026-08-10T14:00:00Z");
    assert.equal(result.endsAt, "2026-08-10T18:00:00Z");
  });

  it("reads schema.org Event subtypes like SocialEvent (Eventbrite's actual markup)", () => {
    const html = `<script type="application/ld+json">
      {"@type": "SocialEvent", "name": "London A.I. Networking", "startDate": "2026-09-08T18:00:00+01:00", "endDate": "2026-09-08T20:30:00+01:00", "location": {"name": "Davy's at St James'", "address": {"streetAddress": "Pall Mall", "addressLocality": "London", "addressCountry": "GB"}}}
    </script>`;
    const result = extractEventInfoFromHtml(html);
    assert.equal(result.title, "London A.I. Networking");
    assert.equal(result.location, "Davy's at St James'");
    assert.equal(result.startsAt, "2026-09-08T18:00:00+01:00");
    assert.equal(result.endsAt, "2026-09-08T20:30:00+01:00");
  });

  it("finds the Event entry inside an @graph array of JSON-LD types", () => {
    const html = `<script type="application/ld+json">
      [{"@type": "WebPage", "name": "Not the event"}, {"@type": "Event", "name": "Founders Mixer", "startDate": "2026-08-10T18:00:00Z"}]
    </script>`;
    const result = extractEventInfoFromHtml(html);
    assert.equal(result.title, "Founders Mixer");
    assert.equal(result.startsAt, "2026-08-10T18:00:00Z");
  });

  it("finds an Event inside a schema.org @graph object", () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"Page"},{"@type":"Event","name":"Graph Event","startDate":"2026-08-29T11:00:00+01:00"}]}
    </script>`;
    assert.equal(
      extractEventInfoFromHtml(html, new Date("2026-08-13T09:00:00Z")).startsAt,
      "2026-08-29T11:00:00+01:00",
    );
  });

  it("prefers the nearest future Event when stale and current records share a page", () => {
    const html = `<script type="application/ld+json">[
      {"@type":"Event","name":"Old event","startDate":"2025-07-12T11:00:00+01:00"},
      {"@type":"Event","name":"Current event","startDate":"2026-08-29T11:00:00+01:00","endDate":"2026-08-29T23:00:00+01:00"}
    ]</script>`;
    const result = extractEventInfoFromHtml(html, new Date("2026-08-13T09:00:00Z"));
    assert.equal(result.title, "Current event");
    assert.equal(result.startsAt, "2026-08-29T11:00:00+01:00");
  });

  it("drops an end date that is not after its start", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Event","name":"Broken end","startDate":"2026-08-29T11:00:00+01:00","endDate":"2025-07-12T23:00:00+01:00"}
    </script>`;
    assert.equal(extractEventInfoFromHtml(html).endsAt, null);
  });

  it("falls back to og:title when there is no JSON-LD Event", () => {
    const html = `<meta property="og:title" content="ProductCon &amp; Friends" />`;
    const result = extractEventInfoFromHtml(html);
    assert.equal(result.title, "ProductCon & Friends");
    assert.equal(result.location, "");
    assert.equal(result.startsAt, null);
  });

  it("falls back to the <title> tag when there is no og:title either", () => {
    const html = `<title>Just a page title</title>`;
    assert.equal(extractEventInfoFromHtml(html).title, "Just a page title");
  });

  it("leaves location and dates blank rather than guessing from prose", () => {
    const html = `<title>ProductCon</title><p>Join us at ExCeL London on August 10th, 2pm-6pm.</p>`;
    const result = extractEventInfoFromHtml(html);
    assert.equal(result.location, "");
    assert.equal(result.startsAt, null);
    assert.equal(result.endsAt, null);
  });

  it("ignores a malformed JSON-LD block instead of throwing", () => {
    const html = `<script type="application/ld+json">{not valid json</script><title>Still works</title>`;
    assert.doesNotThrow(() => extractEventInfoFromHtml(html));
    assert.equal(extractEventInfoFromHtml(html).title, "Still works");
  });

  it("rejects an invalid JSON-LD date rather than passing through garbage", () => {
    const html = `<script type="application/ld+json">
      {"@type": "Event", "name": "ProductCon", "startDate": "not-a-real-date"}
    </script>`;
    assert.equal(extractEventInfoFromHtml(html).startsAt, null);
  });
});
