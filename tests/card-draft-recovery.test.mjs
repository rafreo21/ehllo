import assert from "node:assert/strict";
import test from "node:test";

import {
  CARD_LIBRARY_KEY,
  createLibraryCard,
  readCardLibrary,
  upsertLibraryCard,
} from "../lib/card-library.ts";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test("recovers an edited draft with its images and three repeated contact methods", () => {
  const storage = memoryStorage();
  const draft = createLibraryCard({
    id: "draft-card",
    slug: "draft-card",
    label: "Conference",
    name: "Raphael Okojie",
    theme: "#5146e5",
    photo: "data:image/png;base64,profile",
    companyLogo: "data:image/png;base64,logo",
    coverPhoto: "data:image/jpeg;base64,cover",
    methods: [
      { id: "email-1", type: "email", value: "work@example.com", label: "Work" },
      { id: "email-2", type: "email", value: "hello@example.com", label: "Personal" },
      { id: "email-3", type: "email", value: "bookings@example.com", label: "Bookings" },
    ],
  });

  upsertLibraryCard(storage, draft);
  const [recovered] = readCardLibrary(storage);

  assert.equal(recovered.status, "draft");
  assert.equal(recovered.name, "Raphael Okojie");
  assert.equal(recovered.theme, "#5146e5");
  assert.equal(recovered.photo, draft.photo);
  assert.equal(recovered.companyLogo, draft.companyLogo);
  assert.equal(recovered.coverPhoto, draft.coverPhoto);
  assert.deepEqual(recovered.methods, draft.methods);
});

test("drops only a completely untouched draft during recovery", () => {
  const untouched = createLibraryCard({ id: "empty", slug: "empty" });
  const edited = createLibraryCard({ id: "edited", slug: "edited", bio: "A saved introduction" });
  const storage = memoryStorage({
    [CARD_LIBRARY_KEY]: JSON.stringify([untouched, edited]),
  });

  const recovered = readCardLibrary(storage);

  assert.deepEqual(recovered.map((card) => card.id), ["edited"]);
});
