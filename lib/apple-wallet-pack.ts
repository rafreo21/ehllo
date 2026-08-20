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
    // The wordmark takes the same colour the pass text does, so the brand stays
    // legible on a light card and a dark one alike - which is what logoText used to
    // get for free by rendering in foregroundColor.
    ...(await walletIconBuffers(themeForegroundColor(normalizeThemeColor(card.themeColor)))),
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

    await Promise.all(STRIP_SCALES.map(async ([fileName, width, height]) => {
      const band = () => sharp({
        create: { width, height, channels: 4, background: stripBackground },
      });

      try {
        if (profileImage) {
          // "attention" keeps the face in frame far more reliably than a centre crop,
          // which decapitates most portraits at this aspect.
          const photo = await sharp(profileImage)
            .resize(width, height, { fit: "cover", position: "attention" })
            .png()
            .toBuffer();

          // A scrim under the name, bottom-weighted now that the name sits at the
          // bottom. White text on an unknown photograph is fine over a dark jacket
          // and illegible over a bright window, and we do not get to choose which.
          // Pure alpha over black, so it never tints the photograph.
          const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
            + `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">`
            + `<stop offset="0" stop-color="#000" stop-opacity="0.55"/>`
            + `<stop offset="0.62" stop-color="#000" stop-opacity="0.10"/>`
            + `<stop offset="1" stop-color="#000" stop-opacity="0"/>`
            + `</linearGradient></defs>`
            + `<rect width="${width}" height="${height}" fill="url(#s)"/>`
            + `</svg>`;

          files[fileName] = await band()
            .composite([{ input: photo }, { input: Buffer.from(overlay) }])
            .png()
            .toBuffer();
          return;
        }

        // No photograph: the band is simply the card's own colour, carrying the name
        // and nothing else. An avatar with initials was tried here and taken back out -
        // a circle floating in a 123pt strip read as a placeholder for something
        // missing, where a clean field of the card's colour just reads as the card.
        files[fileName] = await band().png().toBuffer();
        return;
      } catch {
        // Drawing type needs a font in the runtime, and fontconfig is thin in a
        // serverless image. If the composite fails, fall through to a band that is
        // still the card's colour rather than losing the pass over a glyph.
      }

      files[fileName] = profileImage
        ? await band()
          .composite([{ input: await sharp(profileImage).resize(width, height, { fit: "cover", position: "attention" }).png().toBuffer() }])
          .png()
          .toBuffer()
        : await band().png().toBuffer();
    }));

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
