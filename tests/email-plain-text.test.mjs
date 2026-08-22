import assert from "node:assert/strict";
import test from "node:test";

import { htmlToPlainText } from "../lib/email-plain-text.ts";
import { buildReminderDigestEmail } from "../lib/reminder-email.ts";

test("a link keeps its destination, because a label alone goes nowhere", () => {
  const text = htmlToPlainText('<p>Time to <a href="https://ehllo.io/app">follow up</a>.</p>');
  assert.equal(text, "Time to follow up (https://ehllo.io/app).");
});

test("a link whose label is its own address is not repeated", () => {
  assert.equal(htmlToPlainText('<a href="mailto:a@b.com">a@b.com</a>'), "a@b.com");
  assert.equal(htmlToPlainText('<a href="https://ehllo.io">https://ehllo.io</a>'), "https://ehllo.io");
});

test("styles and scripts are dropped whole, not flattened into the message", () => {
  const text = htmlToPlainText("<style>.a{color:red}</style><p>Hello</p><script>alert(1)</script>");
  assert.equal(text, "Hello");
  assert.ok(!text.includes("color"));
  assert.ok(!text.includes("alert"));
});

test("structure that reads as a break becomes one", () => {
  assert.equal(htmlToPlainText("<p>One</p><p>Two</p>"), "One\n\nTwo");
  assert.equal(htmlToPlainText("Line<br>Next"), "Line\nNext");
  assert.equal(htmlToPlainText("<ul><li>First</li><li>Second</li></ul>"), "- First\n- Second");
});

test("entities are decoded once, not re-read", () => {
  assert.equal(htmlToPlainText("<p>Tea &amp; toast</p>"), "Tea & toast");
  assert.equal(htmlToPlainText("<p>Caf&#233;</p>"), "Café");
  // &#38; is an ampersand and must not then be treated as the start of another entity.
  assert.equal(htmlToPlainText("<p>A&#38;amp;B</p>"), "A&amp;B");
});

test("runs of whitespace collapse without eating the line breaks", () => {
  assert.equal(htmlToPlainText("<p>One</p>\n\n\n<p>Two</p>"), "One\n\nTwo");
  assert.equal(htmlToPlainText("<p>  spaced   out  </p>"), "spaced out");
});

test("the real reminder digest produces a usable text part", () => {
  const { html } = buildReminderDigestEmail([
    {
      encounterId: "e1",
      actionId: "a1",
      title: "Send the deck",
      personName: "Raf Reo",
      encounterTitle: "Coffee with Raf Reo",
      channel: "email",
      owner: "me",
      status: "open",
      dueAt: "2026-08-20T09:00:00.000Z",
    },
  ], "https://staging.ehllo.io");

  const text = htmlToPlainText(html);
  assert.ok(text.length > 20, "there is a real text part, not an empty one");
  assert.ok(text.includes("Send the deck"), "the follow-up itself survives");
  assert.ok(!text.includes("<"), "no markup leaks into the text part");
  assert.ok(text.includes("https://staging.ehllo.io"), "the link is reachable from plain text");
});
