import test from "node:test";
import assert from "node:assert/strict";

import { mailtoComposeLink } from "../lib/outbound-draft.ts";

test("mailtoComposeLink encodes spaces as percent twenty, not plus signs", () => {
  const href = mailtoComposeLink(
    "sarah@example.com",
    "Could you add your LinkedIn?",
    "Hey Sarah,\n\nIt was great meeting you.\n\nCould you add your LinkedIn to your ehllo card?",
  );

  assert.match(href, /^mailto:sarah%40example\.com\?/);
  assert.match(href, /subject=Could%20you%20add%20your%20LinkedIn%3F/);
  assert.match(href, /body=Hey%20Sarah/);
  assert.doesNotMatch(href, /\+/);
});

test("mailtoComposeLink keeps readable follow-up text without plus artifacts", () => {
  const href = mailtoComposeLink(
    "alex@example.com",
    "Best way to stay in touch",
    "Hey Alex,\n\nIt was great meeting you.\n\nI wanted to follow up on Connect on LinkedIn.\n\nThanks!",
  );

  assert.match(decodeURIComponent(href.split("body=")[1] || ""), /Connect on LinkedIn/);
  assert.doesNotMatch(href, /body=.*\+.*Connect/);
});
