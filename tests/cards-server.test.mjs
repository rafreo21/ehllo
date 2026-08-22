import test from "node:test";
import assert from "node:assert/strict";

import {
  cardMatchesLocal,
  libraryCardFromRows,
  libraryCardToRow,
  methodsForUpsert,
} from "../lib/cards-server.ts";

test("libraryCardFromRows maps card and methods into library shape", () => {
  const card = libraryCardFromRows(
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      workspace_id: "ws",
      slug: "alex-morgan",
      label: "Primary card",
      full_name: "Alex Morgan",
      job_title: "Consultant",
      company: "Northstar",
      bio: "Helps teams ship.",
      theme_color: "#9FE870",
      profile_image_url: "photo-data",
      company_logo_url: "",
      cover_image_url: "",
      status: "published",
      published_at: "2026-07-26T00:00:00.000Z",
      created_at: "2026-07-26T00:00:00.000Z",
      updated_at: "2026-07-26T00:00:00.000Z",
    },
    [{
      id: "method-1",
      card_id: "550e8400-e29b-41d4-a716-446655440000",
      method_type: "email",
      value: "alex@example.com",
      label: "Work",
      sort_order: 0,
    }],
  );

  assert.equal(card.label, "Primary card");
  assert.equal(card.methods[0]?.value, "alex@example.com");
});

test("libraryCardToRow preserves uuid ids and normalizes slug", () => {
  const row = libraryCardToRow(
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      slug: "Alex-Morgan",
      label: "Primary card",
      name: "Alex Morgan",
      role: "Consultant",
      company: "Northstar",
      bio: "",
      theme: "#9fe870",
      photo: "",
      companyLogo: "",
      coverPhoto: "",
      methods: [],
      createdAt: "",
      updatedAt: "",
    },
    "workspace-id",
    "draft",
  );

  assert.equal(row.slug, "alex-morgan");
  assert.equal(row.status, "draft");
});

test("methodsForUpsert keeps repeated method types in order", () => {
  const rows = methodsForUpsert("card-id", [
    { id: "1", type: "email", value: "old@example.com", label: "Old" },
    { id: "2", type: "email", value: "new@example.com", label: "New" },
    { id: "3", type: "website", value: "https://example.com", label: "Site" },
  ]);

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.value), [
    "old@example.com",
    "new@example.com",
    "https://example.com",
  ]);
  assert.deepEqual(rows.map((row) => row.sort_order), [0, 1, 2]);
});

test("cardMatchesLocal matches by id or slug", () => {
  const server = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    slug: "alex-morgan",
    label: "Primary",
    name: "Alex Morgan",
    role: "",
    company: "",
    bio: "",
    theme: "#9fe870",
    photo: "",
    companyLogo: "",
    coverPhoto: "",
    methods: [],
    createdAt: "",
    updatedAt: "",
  };
  const local = { ...server, id: "local-id", slug: "alex-morgan" };

  assert.equal(cardMatchesLocal(server, local), true);
});
