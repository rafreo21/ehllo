import { createHash } from "node:crypto";
import forge from "node-forge";
import JSZip from "jszip";

import { buildApplePassJson, walletIconBuffers } from "./apple-wallet-pass";
import type { AppleWalletCerts, WalletCardPayload } from "./wallet-config";

function sha1(content: Buffer | string) {
  return createHash("sha1").update(content).digest("hex");
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

  const profileImage = await fetchImageBuffer(card.profileImageUrl || "");
  if (profileImage) {
    files["thumbnail.png"] = profileImage;
    files["thumbnail@2x.png"] = profileImage;
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
