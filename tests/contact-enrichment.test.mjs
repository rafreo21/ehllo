import assert from "node:assert/strict";
import test from "node:test";

import {
  enrichContactField,
  enrichmentConfidenceLabel,
  guessCompanyDomain,
  guessWorkEmail,
  isFillableEnrichmentResult,
  WORK_EMAIL_PROVIDERS,
} from "../lib/contact-enrichment.ts";

test("guessCompanyDomain strips legal suffixes and parentheses", () => {
  assert.equal(guessCompanyDomain("Autospend (Formerly Collect App)"), "autospend.com");
  assert.equal(guessCompanyDomain("Nexleaf Analytics, Inc."), "nexleafanalytics.com");
});

test("guessWorkEmail builds a first.last pattern for internal use only", () => {
  assert.equal(
    guessWorkEmail("Oluwatosin Kazeem", "Autospend"),
    "oluwatosin.kazeem@autospend.com",
  );
});

test("work email waterfall uses Surfe provider order", () => {
  assert.deepEqual(
    WORK_EMAIL_PROVIDERS.map((provider) => provider.id),
    ["linkedin", "hunter", "findymail", "rocketreach", "apollo"],
  );
});

test("enrichContactField uses LinkedIn work email when visible", async () => {
  const result = await enrichContactField({
    fullName: "Victoria Lessor",
    company: "Inspired Thinking Group",
    field: "email",
    seedWorkEmail: "victoria.lessor@inspiredthinking.com",
    seedPersonalEmail: "victoria@gmail.com",
  });

  assert.equal(result.value, "victoria.lessor@inspiredthinking.com");
  assert.equal(result.provider, "linkedin");
  assert.equal(result.confidence, "likely");
  assert.equal(result.steps[1]?.status, "skipped");
  assert.equal(result.steps[1]?.detail, "Skipped - verified match already found");
});

test("enrichContactField does not use personal email for work email lookup", async () => {
  const result = await enrichContactField({
    fullName: "Victoria Lessor",
    company: "Inspired Thinking Group",
    field: "email",
    seedPersonalEmail: "victoria@gmail.com",
  });

  assert.equal(result.value, "");
  assert.equal(result.confidence, "none");
  assert.equal(result.steps[0]?.status, "miss");
});

test("enrichContactField never returns pattern guesses", async () => {
  const result = await enrichContactField({
    fullName: "Ken Wu",
    company: "Stripe",
    field: "email",
  });

  assert.equal(result.value, "");
  assert.equal(result.provider, "");
  assert.ok(!result.steps.some((step) => step.id === "pattern"));
  assert.equal(result.steps.find((step) => step.id === "hunter")?.status, "skipped");
});

test("isFillableEnrichmentResult rejects empty results", async () => {
  const result = await enrichContactField({
    fullName: "Ken Wu",
    company: "Stripe",
    field: "email",
  });

  assert.equal(isFillableEnrichmentResult(result), false);
});

test("enrichmentConfidenceLabel maps verified providers", () => {
  assert.equal(enrichmentConfidenceLabel("verified"), "Verified");
  assert.equal(enrichmentConfidenceLabel("likely"), "From LinkedIn");
});
