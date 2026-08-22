import assert from "node:assert/strict";
import test from "node:test";

import { cardPublishFingerprint } from "../lib/card-library.ts";

const card = {
  id: "card-1",
  slug: "raf-card",
  label: "Work",
  name: "Raf Okojie",
  role: "Designer",
  company: "ehllo",
  bio: "A short bio",
  theme: "#9FE870",
  photo: "",
  companyLogo: "",
  coverPhoto: "",
  methods: [{ id: "email", type: "email", value: "raf@example.com", label: "Work" }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  status: "published",
  publishedAt: "2026-01-01T00:00:00.000Z",
};

test("ignores persistence metadata when checking publish state", () => {
  assert.equal(cardPublishFingerprint(card), cardPublishFingerprint({
    ...card,
    updatedAt: "2026-07-31T00:00:00.000Z",
    publishedAt: "2026-07-31T00:00:00.000Z",
  }));
});

test("detects user-visible card changes", () => {
  assert.notEqual(cardPublishFingerprint(card), cardPublishFingerprint({ ...card, bio: "A changed bio" }));
  assert.notEqual(cardPublishFingerprint(card), cardPublishFingerprint({ ...card, photo: "data:image/png;base64,changed" }));
});
