import test from "node:test";
import assert from "node:assert/strict";

import { buildCardVcard, escapeVcard } from "../lib/vcard-export.ts";

test("escapeVcard escapes commas, semicolons, and newlines", () => {
  assert.equal(escapeVcard("A, B; C\nD"), "A\\, B\\; C\\nD");
});

test("buildCardVcard writes structured name fields for iOS and Android", () => {
  const { body } = buildCardVcard({
    fullName: "Raphael Okojie",
    jobTitle: "Product Designer",
    company: "Nexleaf Analytics",
    bio: "Design systems and product strategy.",
    cardUrl: "https://aftermeet-beta.vercel.app/c/card-abc",
    methods: [
      { method_type: "email", value: "rafreo21@gmail.com" },
      { method_type: "linkedin", value: "https://linkedin.com/in/rafreo" },
      { method_type: "website", value: "https://rafreo.webflow.io" },
    ],
    scannedAt: new Date("2026-07-26T12:00:00.000Z"),
  });

  assert.match(body, /^BEGIN:VCARD\r\n/);
  assert.match(body, /N:Okojie;Raphael;;;/);
  assert.match(body, /FN:Raphael Okojie/);
  assert.match(body, /ORG:Nexleaf Analytics/);
  assert.match(body, /TITLE:Product Designer/);
  assert.match(body, /EMAIL;TYPE=INTERNET:rafreo21@gmail.com/);
  assert.match(body, /URL:https:\/\/rafreo\.webflow\.io/);
  assert.match(body, /item1\.URL:https:\/\/linkedin\.com\/in\/rafreo/);
  assert.match(body, /item1\.X-ABLabel:LinkedIn/);
  assert.match(body, /item2\.URL:https:\/\/aftermeet-beta\.vercel\.app\/c\/card-abc/);
  assert.match(body, /item2\.X-ABLabel:ehllo card/);
  assert.doesNotMatch(body, /^URL:https:\/\/aftermeet-beta\.vercel\.app/m);
  assert.match(body, /NOTE:.*When we met: 26 July 2026/s);
  assert.match(body, /END:VCARD\r\n$/);
});

test("buildCardVcard normalizes phone numbers for contact apps", () => {
  const { body } = buildCardVcard({
    fullName: "Alex Morgan",
    cardUrl: "https://aftermeet.app/c/alex",
    methods: [{ method_type: "phone", value: "+44 7473 177720" }],
  });

  assert.match(body, /TEL;TYPE=CELL,VOICE:\+447473177720/);
});

test("buildCardVcard keeps custom labels on email, phone, and link fields", () => {
  const { body } = buildCardVcard({
    fullName: "Raphael Okojie",
    cardUrl: "https://aftermeet.app/c/card",
    methods: [
      { method_type: "email", value: "rafreo21@gmail.com", label: "Personal" },
      { method_type: "phone", value: "+447473177720", label: "Mobile" },
      { method_type: "link", value: "https://rafreo.webflow.io", label: "View my work" },
      { method_type: "paypal", value: "@rafreo", label: "Pay with PayPal" },
    ],
  });

  assert.match(body, /item1\.EMAIL;TYPE=INTERNET:rafreo21@gmail.com/);
  assert.match(body, /item1\.X-ABLabel:Personal/);
  assert.match(body, /item2\.TEL;TYPE=CELL,VOICE:\+447473177720/);
  assert.match(body, /item2\.X-ABLabel:Mobile/);
  assert.match(body, /item3\.URL:https:\/\/rafreo\.webflow\.io/);
  assert.match(body, /item3\.X-ABLabel:View my work/);
  assert.match(body, /item4\.URL:https:\/\/paypal\.me\/rafreo/);
  assert.match(body, /item4\.X-ABLabel:Pay with PayPal/);
});

test("buildCardVcard exports skype and fallback note values", () => {
  const { body } = buildCardVcard({
    fullName: "Alex Morgan",
    cardUrl: "https://aftermeet.app/c/alex",
    methods: [
      { method_type: "skype", value: "alex.morgan", label: "Skype" },
      { method_type: "discord", value: "alex#1234", label: "Discord" },
    ],
  });

  assert.match(body, /item1\.URL:skype:alex\.morgan\?chat/);
  assert.match(body, /item1\.X-ABLabel:Skype/);
  assert.match(body, /NOTE:.*Discord: alex#1234/s);
});

test("buildCardVcard embeds profile and company logo photos", () => {
  const { body } = buildCardVcard({
    fullName: "Raphael Okojie",
    cardUrl: "https://aftermeet.app/c/card",
    methods: [],
    profilePhoto: { base64: "aGVsbG8=", mimeType: "image/jpeg" },
    companyLogoPhoto: { base64: "bG9nbw==", mimeType: "image/png" },
    coverPhotoUrl: "https://aftermeet.app/cover.jpg",
  });

  assert.match(body, /PHOTO;ENCODING=b;TYPE=JPEG:aGVsbG8=/);
  assert.match(body, /LOGO;ENCODING=b;TYPE=PNG:bG9nbw==/);
  assert.match(body, /item2\.URL:https:\/\/aftermeet\.app\/cover\.jpg/);
  assert.match(body, /item2\.X-ABLabel:Cover photo/);
});

test("buildCardVcard falls back to photo URIs when embeds are unavailable", () => {
  const { body } = buildCardVcard({
    fullName: "Alex Morgan",
    cardUrl: "https://aftermeet.app/c/alex",
    methods: [],
    profilePhotoUrl: "https://cdn.example/alex.jpg",
    companyLogoUrl: "https://cdn.example/logo.png",
  });

  assert.match(body, /PHOTO;VALUE=URI:https:\/\/cdn\.example\/alex\.jpg/);
  assert.match(body, /LOGO;VALUE=URI:https:\/\/cdn\.example\/logo\.png/);
});

test("shareAssetProfileToVcardInput includes public image URLs", async () => {
  const { shareAssetProfileToVcardInput } = await import("../lib/contact-qr.ts");
  const input = shareAssetProfileToVcardInput({
    name: "Alex Morgan",
    role: "Designer",
    company: "Acme",
    cardUrl: "https://aftermeet.app/c/alex",
    photoUrl: "https://cdn.example/profile.jpg",
    companyLogoUrl: "https://cdn.example/logo.png",
    coverPhotoUrl: "https://cdn.example/cover.jpg",
    showCompany: true,
    methods: [],
  });

  assert.equal(input.profilePhotoUrl, "https://cdn.example/profile.jpg");
  assert.equal(input.companyLogoUrl, "https://cdn.example/logo.png");
  assert.equal(input.coverPhotoUrl, "https://cdn.example/cover.jpg");
});

test("buildCardVcard slugifies the download filename", () => {
  const { filename } = buildCardVcard({
    fullName: "Raphael Okojie",
    cardUrl: "https://aftermeet.app/c/card",
    methods: [],
  });

  assert.equal(filename, "raphael-okojie");
});

test("buildCardVcard exports every social link with labels for phone contacts", () => {
  const { body } = buildCardVcard({
    fullName: "Alex Morgan",
    cardUrl: "https://aftermeet.app/c/alex",
    methods: [
      { method_type: "x", value: "@alexm" },
      { method_type: "instagram", value: "alexm", label: "Instagram" },
      { method_type: "tiktok", value: "@alexm" },
      { method_type: "linkedin", value: "alex-morgan" },
    ],
  });

  assert.match(body, /item1\.URL:https:\/\/x\.com\/alexm/);
  assert.match(body, /item1\.X-ABLabel:X/);
  assert.match(body, /item2\.URL:https:\/\/instagram\.com\/alexm/);
  assert.match(body, /item3\.URL:https:\/\/tiktok\.com\/@alexm/);
  assert.match(body, /item4\.URL:https:\/\/linkedin\.com\/in\/alex-morgan/);
});

test("buildCardVcard omits company fields when company details are hidden", () => {
  const { body } = buildCardVcard({
    fullName: "Alex Morgan",
    cardUrl: "https://aftermeet.app/c/alex",
    company: "Northstar Advisory",
    showCompanyDetails: false,
    methods: [
      { method_type: "email", value: "alex@example.com" },
      { method_type: "website", value: "https://northstar.example" },
      { method_type: "linkedin", value: "alex-morgan" },
    ],
  });

  assert.doesNotMatch(body, /ORG:/);
  assert.doesNotMatch(body, /URL:https:\/\/northstar\.example/);
  assert.match(body, /item1\.URL:https:\/\/linkedin\.com\/in\/alex-morgan/);
});
