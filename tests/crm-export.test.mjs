import test from "node:test";
import assert from "node:assert/strict";

import { buildHubSpotContactProperties, buildHubSpotNoteBody } from "../lib/crm/hubspot.ts";
import { activationMetrics, buildCrmExportCsv } from "../lib/crm/export.ts";

const sampleContact = {
  id: "1",
  firstName: "Alex",
  lastName: "Morgan",
  email: "alex@example.com",
  phone: "+44 7700 900123",
  company: "Northstar Advisory",
  role: "Consultant",
  context: "Discussed a Q3 pilot.",
  source: "exchange",
  exchangeId: "abc",
};

const sampleEncounter = {
  id: "enc-1",
  title: "Coffee chat",
  personName: "Alex Morgan",
  personEmail: "alex@example.com",
  startedAt: "2026-07-26T10:00:00.000Z",
  endedAt: "2026-07-26T10:20:00.000Z",
  durationSeconds: 1200,
  consent: {
    confirmed: true,
    method: "verbal",
    confirmedAt: "2026-07-26T10:00:00.000Z",
    scriptVersion: "2026-07-26",
  },
  transcript: "",
  privateNotes: "Needs a one-pager.",
  sharedSummary: "Interested in a pilot.",
  actions: [{
    id: "a1",
    title: "Send pilot deck",
    channel: "email",
    owner: "me",
    dueAt: "",
    status: "open",
  }],
  status: "reviewed",
  shareToken: "token",
};

test("buildHubSpotContactProperties maps core contact fields", () => {
  const properties = buildHubSpotContactProperties({
    contact: sampleContact,
    encounters: [sampleEncounter],
  });
  assert.equal(properties.firstname, "Alex");
  assert.equal(properties.email, "alex@example.com");
  assert.equal(properties.jobtitle, "Consultant");
});

test("buildHubSpotNoteBody includes encounter context", () => {
  const body = buildHubSpotNoteBody({
    contact: sampleContact,
    encounters: [sampleEncounter],
  });
  assert.match(body, /ehllo relationship sync/);
  assert.match(body, /Interested in a pilot/);
  assert.match(body, /Send pilot deck/);
});

test("buildCrmExportCsv escapes contact rows", () => {
  const csv = buildCrmExportCsv([{
    ...sampleContact,
    context: 'Said "yes" to a pilot',
  }]);
  assert.match(csv, /"Said ""yes"" to a pilot"/);
});

test("activationMetrics counts open and completed follow-ups", () => {
  const metrics = activationMetrics([sampleContact], [sampleEncounter]);
  assert.equal(metrics.contacts, 1);
  assert.equal(metrics.encounters, 1);
  assert.equal(metrics.openFollowUps, 1);
  assert.equal(metrics.completedFollowUps, 0);
});
