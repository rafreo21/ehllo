#!/usr/bin/env node
/**
 * Validate the Apple Wallet signing material before trusting it in an
 * environment. Google Wallet already had `npm run verify:google-wallet`; Apple
 * had nothing, so a bad or missing certificate could only be discovered by
 * tapping "Add to Apple Wallet" on a physical iPhone and reading a generic
 * failure message.
 *
 * Reads APPLE_WALLET_* from the selected .env.<environment>.local when present,
 * and otherwise falls back to the PEM files in .secrets/apple-wallet/. Checks
 * that the certificate parses, has not expired, was issued by the supplied WWDR
 * intermediate, matches the private key, and carries the pass type identifier
 * the pass will actually claim. Finally it signs a throwaway manifest, which is
 * the operation that fails at request time.
 *
 *   npm run verify:apple-wallet
 *   npm run verify:apple-wallet -- --production   (with EHLLO_ALLOW_PRODUCTION=1)
 *   npm run verify:apple-wallet -- --print-env    (emit the Vercel env block)
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import forge from "node-forge";

import { selectSupabaseTarget } from "./supabase-target.mjs";

const SECRETS_DIR = resolve(process.cwd(), ".secrets/apple-wallet");
const printEnv = process.argv.includes("--print-env");

function readSecretFile(name) {
  try {
    return readFileSync(resolve(SECRETS_DIR, name), "utf8").trim();
  } catch {
    return "";
  }
}

// Vercel env values are frequently pasted with literal backslash-n instead of
// real newlines; node-forge rejects those with an opaque "Invalid PEM formatted
// message", so normalise before validating and report it as its own problem.
function normalisePem(value) {
  if (!value) return { pem: "", hadEscapedNewlines: false };
  const hadEscapedNewlines = !value.includes("\n") && value.includes("\\n");
  return { pem: hadEscapedNewlines ? value.replace(/\\n/g, "\n") : value, hadEscapedNewlines };
}

const problems = [];
const notes = [];

function fail(message) { problems.push(message); }
function note(message) { notes.push(message); }

const { environment, read } = selectSupabaseTarget();

const sources = {};
function resolveValue(envName, fallbackFile) {
  const fromEnv = read(envName);
  if (fromEnv) {
    sources[envName] = process.env[envName]?.trim() ? "shell environment" : `.env.${environment}.local`;
    return fromEnv;
  }
  const fromFile = fallbackFile ? readSecretFile(fallbackFile) : "";
  if (fromFile) {
    sources[envName] = `.secrets/apple-wallet/${fallbackFile}`;
    return fromFile;
  }
  sources[envName] = "(missing)";
  return "";
}

const passTypeId = resolveValue("APPLE_WALLET_PASS_TYPE_ID");
const teamId = resolveValue("APPLE_WALLET_TEAM_ID");
const wwdrRaw = resolveValue("APPLE_WALLET_WWDR_CERT", "AppleWWDRCAG4.pem");
const signerCertRaw = resolveValue("APPLE_WALLET_SIGNER_CERT", "signerCert.pem");
const signerKeyRaw = resolveValue("APPLE_WALLET_SIGNER_KEY", "signerKey.pem");
const passphrase = read("APPLE_WALLET_SIGNER_KEY_PASSPHRASE");

console.log(`Verifying Apple Wallet signing material for ${environment}.\n`);
for (const [name, value] of Object.entries({
  APPLE_WALLET_PASS_TYPE_ID: passTypeId,
  APPLE_WALLET_TEAM_ID: teamId,
  APPLE_WALLET_WWDR_CERT: wwdrRaw,
  APPLE_WALLET_SIGNER_CERT: signerCertRaw,
  APPLE_WALLET_SIGNER_KEY: signerKeyRaw,
})) {
  console.log(`  ${name.padEnd(28)} ${value ? "found" : "MISSING"}  ← ${sources[name]}`);
  if (!value) fail(`${name} is not set.`);
}
console.log("");

if (problems.length) {
  report();
}

const wwdr = normalisePem(wwdrRaw);
const cert = normalisePem(signerCertRaw);
const key = normalisePem(signerKeyRaw);
for (const [name, parsed] of [
  ["APPLE_WALLET_WWDR_CERT", wwdr],
  ["APPLE_WALLET_SIGNER_CERT", cert],
  ["APPLE_WALLET_SIGNER_KEY", key],
]) {
  if (parsed.hadEscapedNewlines) {
    note(`${name} contained literal \\n sequences rather than real newlines (normalised for this check, but the server does not do that).`);
  }
}

let signerCert = null;
let wwdrCert = null;
try {
  signerCert = forge.pki.certificateFromPem(cert.pem);
} catch (error) {
  fail(`APPLE_WALLET_SIGNER_CERT could not be parsed: ${error.message}`);
}
try {
  wwdrCert = forge.pki.certificateFromPem(wwdr.pem);
} catch (error) {
  fail(`APPLE_WALLET_WWDR_CERT could not be parsed: ${error.message}`);
}

if (signerCert) {
  const attr = (shortName) => signerCert.subject.attributes.find((a) => a.shortName === shortName)?.value ?? "";
  const uid = signerCert.subject.attributes.find((a) => a.type === "0.9.2342.19200300.100.1.1")?.value ?? "";
  const now = new Date();

  console.log(`  certificate pass type id     ${uid || "(none)"}`);
  console.log(`  certificate team id          ${attr("OU") || "(none)"}`);
  console.log(`  certificate valid            ${signerCert.validity.notBefore.toISOString().slice(0, 10)} → ${signerCert.validity.notAfter.toISOString().slice(0, 10)}`);

  const daysLeft = Math.floor((signerCert.validity.notAfter - now) / 86400000);
  if (now > signerCert.validity.notAfter) fail(`The signing certificate expired on ${signerCert.validity.notAfter.toISOString().slice(0, 10)}.`);
  else if (now < signerCert.validity.notBefore) fail("The signing certificate is not valid yet.");
  else if (daysLeft < 30) note(`The signing certificate expires in ${daysLeft} days.`);

  // A pass whose passTypeIdentifier does not match the certificate's UID is
  // signed successfully and then silently refused by iOS at add time.
  if (uid && passTypeId && uid !== passTypeId) {
    fail(`APPLE_WALLET_PASS_TYPE_ID is "${passTypeId}" but the certificate is issued for "${uid}". iOS rejects a pass whose identifier does not match its certificate.`);
  }
  if (attr("OU") && teamId && attr("OU") !== teamId) {
    fail(`APPLE_WALLET_TEAM_ID is "${teamId}" but the certificate belongs to team "${attr("OU")}".`);
  }
}

if (signerCert && wwdrCert) {
  const issuedByWwdr = signerCert.issuer.hash === wwdrCert.subject.hash;
  if (!issuedByWwdr) {
    fail("The supplied WWDR certificate did not issue the signing certificate — this is usually the wrong WWDR generation (Apple currently issues pass certificates under G4).");
  } else {
    let verified = false;
    try { verified = wwdrCert.verify(signerCert); } catch { verified = false; }
    if (!verified) fail("The WWDR certificate did not verify the signing certificate's signature.");
    else console.log("  chain                        signer verified against WWDR");
  }
  if (new Date() > wwdrCert.validity.notAfter) fail("The WWDR intermediate certificate has expired.");
}

let privateKey = null;
if (signerCert) {
  try {
    privateKey = passphrase
      ? forge.pki.decryptRsaPrivateKey(key.pem, passphrase)
      : forge.pki.privateKeyFromPem(key.pem);
  } catch (error) {
    try {
      privateKey = forge.pki.decryptRsaPrivateKey(key.pem, passphrase || "");
    } catch {
      fail(`APPLE_WALLET_SIGNER_KEY could not be read: ${error.message}`);
    }
  }
  if (!privateKey && !problems.length) {
    fail("APPLE_WALLET_SIGNER_KEY is encrypted and APPLE_WALLET_SIGNER_KEY_PASSPHRASE is missing or wrong.");
  }
  if (privateKey && signerCert.publicKey.n.toString(16) !== privateKey.n.toString(16)) {
    fail("APPLE_WALLET_SIGNER_KEY does not belong to APPLE_WALLET_SIGNER_CERT — they are from different key pairs.");
  }
}

if (privateKey && signerCert && wwdrCert && !problems.length) {
  const manifest = JSON.stringify({ "pass.json": createHash("sha1").update("{}").digest("hex") }, null, 2);
  try {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(manifest, "utf8");
    p7.addCertificate(signerCert);
    p7.addCertificate(wwdrCert);
    p7.addSigner({
      key: privateKey,
      certificate: signerCert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date() },
      ],
    });
    p7.sign({ detached: true });
    const bytes = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary").length;
    console.log(`  signing                      OK (${bytes} byte detached signature)`);
  } catch (error) {
    fail(`Signing a test manifest failed: ${error.message}`);
  }
}

report();

function report() {
  console.log("");
  for (const item of notes) console.log(`  note: ${item}`);
  if (problems.length) {
    console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} found:\n`);
    for (const item of problems) console.error(`  - ${item}`);
    console.error("\nSee docs/mobile/WALLET_SETUP.md for the certificate and environment steps.");
    process.exit(1);
  }

  console.log("\nApple Wallet signing material is valid.");
  console.log("This checks the material only — it cannot confirm the same values are present on the deployed server.");
  console.log(`Confirm that with:  curl -H "Authorization: Bearer <token>" ${environment === "production" ? "https://ehllo.io" : "https://staging.ehllo.io"}/api/mobile/wallet/status`);

  if (printEnv) {
    console.log("\n--- environment variables ---");
    console.log(`APPLE_WALLET_PASS_TYPE_ID=${passTypeId}`);
    console.log(`APPLE_WALLET_TEAM_ID=${teamId}`);
    for (const [name, value] of [
      ["APPLE_WALLET_WWDR_CERT", wwdr.pem],
      ["APPLE_WALLET_SIGNER_CERT", cert.pem],
      ["APPLE_WALLET_SIGNER_KEY", key.pem],
    ]) {
      console.log(`\n${name}:`);
      console.log(value);
    }
  }
  process.exit(0);
}
