import test from "node:test";
import assert from "node:assert/strict";

import { mergeContacts } from "../lib/person-merge.ts";

test("mergeContacts prefers exchange id and unions contact details", () => {
  const existing = {
    id: "card-alex-morgan",
    firstName: "Alex",
    lastName: "Morgan",
    email: "",
    phone: "+1 555 0100",
    company: "ehllo",
    role: "Founder",
    context: "Met via QR scan.",
    source: "scan",
  };
  const incoming = {
    id: "exchange-abc123",
    firstName: "Alex",
    lastName: "Morgan",
    email: "alex@example.com",
    company: "ehllo",
    role: "CEO",
    context: "Shared back from your card.",
    source: "exchange",
    exchangeId: "abc123",
  };

  const merged = mergeContacts(existing, incoming);
  assert.equal(merged.id, "exchange-abc123");
  assert.equal(merged.email, "alex@example.com");
  assert.equal(merged.phone, "+1 555 0100");
  assert.equal(merged.exchangeId, "abc123");
  assert.match(merged.context, /QR scan/);
  assert.match(merged.context, /Shared back/);
});

test("mergeContacts keeps the existing id when no exchange is present", () => {
  const existing = {
    id: "manual-1",
    firstName: "Jamie",
    lastName: "Lee",
    email: "jamie@example.com",
    company: "",
    role: "",
    context: "Captured first.",
  };
  const incoming = {
    id: "linkedin-jamie-lee",
    firstName: "Jamie",
    lastName: "Lee",
    email: "",
    linkedinUrl: "https://www.linkedin.com/in/jamie-lee",
    company: "Studio North",
    role: "Designer",
    context: "Added from LinkedIn.",
    source: "linkedin",
  };

  const merged = mergeContacts(existing, incoming);
  assert.equal(merged.id, "manual-1");
  assert.equal(merged.linkedinUrl, "https://www.linkedin.com/in/jamie-lee");
  assert.equal(merged.company, "Studio North");
});
