import assert from "node:assert/strict";
import test from "node:test";

// Regression guard for a bug that reached real testers.
//
// The widget briefly selected its card with `published.find(c => c.isPrimary)` and no fallback.
// isPrimary mirrors the server's is_primary column, which is simply unset on plenty of accounts,
// so those users got NO card in the payload and a blank white placeholder on the home screen
// while their published card sat right there in the app. It passed review because the one test
// account had is_primary set.
//
// The rule these lock in:
//   published primary  -> that card
//   published, no primary flag anywhere -> the first published card, never nothing
//   nothing published   -> no card, and the widget shows its placeholder on purpose

function selectTarget(cards) {
  const published = cards.filter((card) => card.status === "published" && card.slug);
  return published.find((card) => card.isPrimary) || published[0];
}

test("a published primary card wins", () => {
  const target = selectTarget([
    { slug: "a", status: "published", isPrimary: false, name: "First" },
    { slug: "b", status: "published", isPrimary: true, name: "Primary" },
  ]);
  assert.equal(target.name, "Primary");
});

test("with no primary flag set anywhere, the first published card is still shown", () => {
  // This is the case that broke testers. It must never resolve to undefined.
  const target = selectTarget([
    { slug: "a", status: "published", name: "First" },
    { slug: "b", status: "published", name: "Second" },
  ]);
  assert.ok(target, "a user with a published card must never get an empty widget");
  assert.equal(target.name, "First");
});

test("isPrimary on an unpublished draft does not win over a published card", () => {
  // A draft's QR would lead nowhere, so it must not be chosen.
  const target = selectTarget([
    { slug: "a", status: "draft", isPrimary: true, name: "Draft primary" },
    { slug: "b", status: "published", name: "Published" },
  ]);
  assert.equal(target.name, "Published");
});

test("nothing published means no card, so the placeholder is deliberate", () => {
  assert.equal(selectTarget([{ slug: "a", status: "draft", isPrimary: true }]), undefined);
  assert.equal(selectTarget([]), undefined);
});

test("a published card with no slug is not usable", () => {
  assert.equal(selectTarget([{ status: "published", isPrimary: true, name: "No slug" }]), undefined);
});
