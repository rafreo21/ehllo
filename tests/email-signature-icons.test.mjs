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

test("a non-public card url falls back to the canonical origin, never localhost", async () => {
  const { buildHtmlSignature } = await import("../lib/email-signature.ts");
  // An email is read outside your network, so assets must come from a public host. Deriving the
  // origin from the card URL emitted http://localhost:3000/email-icons/... on a dev server,
  // which no mail client can reach - the icons were simply missing and nothing said so.
  for (const cardUrl of ["not a url", "http://localhost:3000/c/alex", "https://127.0.0.1/c/alex"]) {
    const html = buildHtmlSignature({ ...PROFILE, cardUrl });
    // Only the IMAGE sources matter here. A localhost "View my card" href is correct - the card
    // URL is whatever the card URL is - but an unreachable <img src> shows nothing and says
    // nothing, which is the failure this guards.
    const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
    for (const src of srcs) {
      assert.ok(!src.includes("localhost"), `${cardUrl} produced a localhost asset: ${src}`);
      assert.ok(!/\/\/[\d.]+[/:]/.test(src), `${cardUrl} produced an IP asset: ${src}`);
    }
    assert.match(html, /src="https:\/\/ehllo\.io\/email-icons\/phone\.png"/);
    // The contact details themselves still have to be there.
    assert.match(html, /alex@example\.com/);
    assert.match(html, /\+44 7700 900123/);
  }
});

test("a public https card url keeps its own origin, so staging stays self-consistent", async () => {
  const { buildHtmlSignature } = await import("../lib/email-signature.ts");
  const html = buildHtmlSignature({ ...PROFILE, cardUrl: "https://staging.ehllo.io/c/alex" });
  assert.match(html, /src="https:\/\/staging\.ehllo\.io\/email-icons\/phone\.png"/);
  assert.match(html, /href="https:\/\/staging\.ehllo\.io"/);
});

test("the footer carries the ehllo mark and links the wordmark", async () => {
  const { buildHtmlSignature } = await import("../lib/email-signature.ts");
  const html = buildHtmlSignature(PROFILE);
  assert.match(html, /src="https:\/\/staging\.ehllo\.io\/ehllo-mark\.png"/);
  assert.match(html, /width="14" height="14" alt="ehllo"/);
  assert.match(html, /<a href="https:\/\/staging\.ehllo\.io"[^>]*>ehllo<\/a>/);
});

test("the plain-text signature is unaffected and carries no icons", async () => {
  const { buildPlainSignature } = await import("../lib/email-signature.ts");
  const text = buildPlainSignature(PROFILE);
  assert.ok(!text.includes("email-icons"));
  assert.match(text, /Alex Morgan/);
  assert.match(text, /alex@example\.com/);
});
