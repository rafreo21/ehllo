import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEmailShareUrl,
  buildLinkedInShareUrl,
  buildSmsShareUrl,
  buildWhenWeMetNote,
} from "../lib/card-share-links.ts";

test("buildEmailShareUrl encodes subject and body", () => {
  const url = buildEmailShareUrl("https://aftermeet.app/c/alex", "Alex Morgan");
  assert.match(url, /^mailto:\?subject=/);
  assert.match(decodeURIComponent(url), /Alex Morgan's AfterMeet card/);
});

test("buildSmsShareUrl includes card url in body", () => {
  const url = buildSmsShareUrl("https://aftermeet.app/c/alex", "Alex Morgan");
  assert.match(url, /^sms:/);
  assert.match(decodeURIComponent(url), /aftermeet.app\/c\/alex/);
});

test("buildLinkedInShareUrl wraps the public card url", () => {
  const url = buildLinkedInShareUrl("https://aftermeet.app/c/alex");
  assert.match(url, /linkedin.com\/sharing\/share-offsite/);
  assert.match(url, /aftermeet.app/);
});

test("buildWhenWeMetNote includes date and card url", () => {
  const note = buildWhenWeMetNote("https://aftermeet.app/c/alex", new Date("2026-07-26T12:00:00.000Z"));
  assert.match(note, /When we met: 26 July 2026/);
  assert.match(note, /Saved from AfterMeet/);
});

test("buildWhenWeMetNote omits the where-we-met line when there's no event", () => {
  const note = buildWhenWeMetNote("https://aftermeet.app/c/alex", new Date("2026-07-26T12:00:00.000Z"));
  assert.doesNotMatch(note, /Where we met/);
});

test("buildWhenWeMetNote adds a where-we-met line ahead of the date when an event is active", () => {
  const note = buildWhenWeMetNote("https://aftermeet.app/c/alex", new Date("2026-07-26T12:00:00.000Z"), "ProductCon London");
  const lines = note.split("\n");
  assert.equal(lines[0], "Where we met: ProductCon London");
  assert.match(lines[1], /When we met: 26 July 2026/);
});
