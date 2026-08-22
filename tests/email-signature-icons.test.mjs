import assert from "node:assert/strict";
import test from "node:test";

const PROFILE = {
  name: "Alex Morgan",
  role: "Product Designer",
  company: "Northstar",
  cardUrl: "https://staging.ehllo.io/c/alex-morgan",
  email: "alex@example.com",
  phone: "+44 7700 900123",
};

test("the signature no longer uses emoji dingbats for contact icons", async () => {
  const { buildHtmlSignature } = await import("../lib/email-signature.ts");
  const html = buildHtmlSignature(PROFILE);
  // Gmail and Apple Mail promote these code points to colour emoji, which is what made a
  // professional signature look like a chat message.
  assert.ok(!html.includes("&#9742;"), "telephone dingbat must be gone");
  assert.ok(!html.includes("&#9993;"), "envelope dingbat must be gone");
  assert.ok(!/[☎✉\u{1F4DE}\u{1F4E7}\u{1F4F1}]/u.test(html), "no raw emoji either");
});

test("contact icons are hosted images on the card's own origin", async () => {
  const { buildHtmlSignature } = await import("../lib/email-signature.ts");
  const html = buildHtmlSignature(PROFILE);
  assert.match(html, /src="https:\/\/staging\.ehllo\.io\/email-icons\/phone\.png"/);
  assert.match(html, /src="https:\/\/staging\.ehllo\.io\/email-icons\/envelope\.png"/);
  // 14px, and sized in the attributes as well as the style - Outlook ignores CSS width.
  assert.match(html, /width="14" height="14"/);
});

test("icons carry alt text so blocked images degrade to a label", async () => {
  const { buildHtmlSignature } = await import("../lib/email-signature.ts");
  const html = buildHtmlSignature(PROFILE);
  assert.match(html, /alt="Phone"/);
  assert.match(html, /alt="Email"/);
});

test("an unparseable card url drops the icon instead of emitting a broken image", async () => {
  const { buildHtmlSignature } = await import("../lib/email-signature.ts");
  const html = buildHtmlSignature({ ...PROFILE, cardUrl: "not a url" });
  assert.ok(!html.includes("/email-icons/"), "must not build a relative or malformed src");
  // The contact details themselves still have to be there.
  assert.match(html, /alex@example\.com/);
  assert.match(html, /\+44 7700 900123/);
});

test("the plain-text signature is unaffected and carries no icons", async () => {
  const { buildPlainSignature } = await import("../lib/email-signature.ts");
  const text = buildPlainSignature(PROFILE);
  assert.ok(!text.includes("email-icons"));
  assert.match(text, /Alex Morgan/);
  assert.match(text, /alex@example\.com/);
});
