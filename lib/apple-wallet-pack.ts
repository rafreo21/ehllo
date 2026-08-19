import { createHash } from "node:crypto";
import forge from "node-forge";
import JSZip from "jszip";

import { buildApplePassJson, walletIconBuffers } from "./apple-wallet-pass";
import { normalizeThemeColor, themeForegroundColor } from "./theme-contrast.ts";
import { loadSharp } from "./sharp-runtime.ts";
import type { AppleWalletCerts, WalletCardPayload } from "./wallet-config";

function sha1(content: Buffer | string) {
  return createHash("sha1").update(content).digest("hex");
}

/** The card's theme as sharp's rgb object, falling back to the brand green. */
function themeRgb(themeColor: string) {
  const hex = /^#?([0-9a-f]{6})$/i.exec((themeColor || "").trim());
  const value = hex ? hex[1] : "9fe870";
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
    alpha: 1,
  };
}

/**
 * First and last initial, which is what a card without a photograph has to stand
 * in for a face. Falls back to a single letter for a mononym and to nothing at
 * all for a blank name, because two spaces rendered as "" is worse than an empty
 * band. Diacritics are kept - "Ana Ortiz" and "Ana Ortíz" are different people.
 */
function initialsFor(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const first = [...words[0]][0] ?? "";
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? "") : "";
  return (first + last).toLocaleUpperCase();
}

async function fetchImageBuffer(url: string) {
  if (!url.trim()) return null;
  try {
    const response = await fetch(url.trim());
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

// Signs with a pure-JS PKCS#7/SMIME implementation instead of shelling out to
// the system `openssl` CLI - that binary isn't guaranteed to exist in
// Vercel's Node serverless runtime (it's a separate thing from the OpenSSL
// library Node's own crypto module links against), which was causing this
// to 500 on every request in production while working fine on a dev machine
// that happens to have the CLI installed. Apple Wallet requires a detached
// signature: manifest.json stays a separate file in the pass bundle and the
// signature authenticates it.
function signManifest(manifestContent: string, certs: AppleWalletCerts) {
  const signerCert = forge.pki.certificateFromPem(certs.signerCert);
  const wwdrCert = forge.pki.certificateFromPem(certs.wwdr);
  const privateKey = certs.signerKeyPassphrase
    ? forge.pki.decryptRsaPrivateKey(certs.signerKey, certs.signerKeyPassphrase)
    : forge.pki.privateKeyFromPem(certs.signerKey);
  if (!privateKey) throw new Error("Could not read the Apple Wallet signer key.");

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestContent, "utf8");
  p7.addCertificate(signerCert);
  p7.addCertificate(wwdrCert);
  p7.addSigner({
    key: privateKey,
    certificate: signerCert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      // @types/node-forge only declares `value` as string, but forge's own
      // ASN.1 conversion for signingTime expects a real Date at runtime.
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return Buffer.from(der, "binary");
}

export async function buildAppleWalletPass(card: WalletCardPayload, certs: AppleWalletCerts) {
  const passJson = JSON.stringify(
    buildApplePassJson(card, { passTypeId: certs.passTypeId, teamId: certs.teamId }),
    null,
    2,
  );
  const files: Record<string, Buffer> = {
    "pass.json": Buffer.from(passJson, "utf8"),
    ...(await walletIconBuffers()),
  };

  // The designed card layout, expressed in the parts of a pass that Apple lets
  // us control.
  //
  // The order is already the right one and PassKit draws it: logo and "ehllo"
  // across the top, the strip as a full-width band, then the name, then the role,
  // then the barcode with "Scan to connect" beneath it. What was crude was the
  // band itself - a raw crop of the upload, with nothing at all when there was no
  // photo, so a card without one rendered as a bare block of colour.
  //
  // The slot stays 375x123 because that is the geometry storeCard actually
  // renders; anything else is letterboxed or stretched by iOS, so a taller band
  // is not available however large the file is. What size does buy is density,
  // hence @2x and @3x - a 3:1 crop of a face has little room to spare, and on a
  // retina screen the difference is the whole difference.
  //
  // Composited over the card's theme colour rather than resized alone: a PNG with
  // transparency, or one that cannot fill the band, otherwise leaves black
  // instead of the card's own colour.
  const STRIP_SCALES: Array<[name: string, width: number, height: number]> = [
    ["strip.png", 375, 123],
    ["strip@2x.png", 750, 246],
    ["strip@3x.png", 1125, 369],
  ];
  const stripBackground = themeRgb(card.themeColor);
  const profileImage = await fetchImageBuffer(card.profileImageUrl || "");

  try {
    const sharp = await loadSharp();

    if (profileImage) {
      await Promise.all(STRIP_SCALES.map(async ([name, width, height]) => {
        // "attention" keeps the face in frame far more reliably than a centre
        // crop, which decapitates most portraits at this aspect.
        const photo = await sharp(profileImage)
          .resize(width, height, { fit: "cover", position: "attention" })
          .png()
          .toBuffer();

        // A scrim, because primaryFields carries the name again and PassKit draws
        // it over this band. Without one the name is white text on whatever the
        // photograph happens to be there - fine over a dark jacket, illegible over
        // a bright window or a pale wall, and we do not get to choose which.
        //
        // Top-weighted and stopping short of the bottom, because that is where the
        // name actually lands; darkening the whole frame would dim the face for no
        // reason. Pure alpha over black, so it never tints the photograph.
        const scrim = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
          + `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">`
          + `<stop offset="0" stop-color="#000" stop-opacity="0.55"/>`
          + `<stop offset="0.62" stop-color="#000" stop-opacity="0.10"/>`
          + `<stop offset="1" stop-color="#000" stop-opacity="0"/>`
          + `</linearGradient></defs>`
          + `<rect width="${width}" height="${height}" fill="url(#s)"/></svg>`,
        );

        files[name] = await sharp({
          create: { width, height, channels: 4, background: stripBackground },
        })
          .composite([{ input: photo }, { input: scrim }])
          .png()
          .toBuffer();
      }));
    } else {
      // No photo is a normal state, not a broken one - but a flat band spends the
      // most prominent 123pt of the pass on nothing, so it carries the person's
      // initials instead. Same job an avatar does everywhere else in the app: it
      // stands in for a face without pretending to be one.
      //
      // Text comes from an SVG composite because that is the only way sharp draws
      // type, and it depends on a font being present in the runtime. If none is -
      // fontconfig is thin in a serverless image - the composite is what fails,
      // not the pass: each scale falls back to the flat band this branch used to
      // produce, so the worst case is exactly the old behaviour.
      const initials = initialsFor(card.fullName);
      const inkColor = themeForegroundColor(normalizeThemeColor(card.themeColor));
      await Promise.all(STRIP_SCALES.map(async ([name, width, height]) => {
        const band = () => sharp({
          create: { width, height, channels: 4, background: stripBackground },
        });

        if (initials) {
          try {
            // Sized off the band rather than fixed, so @2x and @3x scale with it
            // instead of drifting. Letter-spacing opens up a two-letter monogram,
            // which otherwise reads as one clenched word.
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
              + `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"`
              + ` font-family="Helvetica Neue, Helvetica, Arial, sans-serif"`
              + ` font-size="${Math.round(height * 0.44)}" font-weight="600"`
              + ` letter-spacing="${Math.max(1, Math.round(height * 0.03))}"`
              + ` fill="${inkColor}">${initials}</text></svg>`;
            files[name] = await band()
              .composite([{ input: Buffer.from(svg) }])
              .png()
              .toBuffer();
            return;
          } catch {
            // Fall through to the plain band below.
          }
        }

        files[name] = await band().png().toBuffer();
      }));
    }
  } catch (error) {
    // A pass without the band is still a working pass. Never fail the whole
    // download because one optional image could not be composed.
    console.error("[apple-wallet] strip image failed, continuing without it", {
      hasPhoto: Boolean(profileImage),
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const manifest = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [name, sha1(content)]),
  );
  const manifestContent = JSON.stringify(manifest, null, 2);
  const signature = signManifest(manifestContent, certs);

  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  zip.file("manifest.json", manifestContent);
  zip.file("signature", signature);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
