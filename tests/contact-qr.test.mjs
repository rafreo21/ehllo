import test from "node:test";
import assert from "node:assert/strict";

import { buildContactQrPayload, resolveShareQrPayload } from "../lib/contact-qr.ts";

test("buildContactQrPayload encodes offline contact data with labeled card URL", () => {
  const payload = buildContactQrPayload({
    fullName: "Alex Morgan",
    jobTitle: "Designer",
    company: "AfterMeet",
    cardUrl: "https://aftermeet.app/c/alex",
    methods: [
      { method_type: "email", value: "alex@example.com" },
      { method_type: "phone", value: "+1 555 0100" },
    ],
  });

  assert.match(payload, /^BEGIN:VCARD\r\n/);
  assert.match(payload, /EMAIL;TYPE=INTERNET:alex@example.com/);
  assert.match(payload, /TEL;TYPE=CELL,VOICE:\+15550100/);
  assert.match(payload, /item1\.URL:https:\/\/aftermeet\.app\/c\/alex/);
  assert.match(payload, /item1\.X-ABLabel:Ehllo card/);
  assert.match(payload, /END:VCARD$/);
});

test("buildContactQrPayload starts with vCard marker for QR scanners", () => {
  const payload = buildContactQrPayload({
    fullName: "Jordan Lee",
    cardUrl: "https://aftermeet.app/c/jordan",
    methods: [],
  });

  assert.match(payload, /^BEGIN:VCARD/);
});

test("resolveShareQrPayload defaults to card URL for online visitor flow", () => {
  const profile = {
    name: "Alex Morgan",
    role: "Designer",
    company: "AfterMeet",
    cardUrl: "https://aftermeet.app/c/alex",
    showCompany: true,
    methods: [],
  };

  assert.equal(resolveShareQrPayload(profile), "https://aftermeet.app/c/alex");
  assert.match(resolveShareQrPayload(profile, "offline"), /^BEGIN:VCARD/);
});
