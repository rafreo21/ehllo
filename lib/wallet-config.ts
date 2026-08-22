export type WalletCardPayload = {
  slug: string;
  fullName: string;
  role: string;
  company: string;
  bio: string;
  themeColor: string;
  cardUrl: string;
  profileImageUrl?: string;
  showCompany?: boolean;
};

export type AppleWalletCerts = {
  passTypeId: string;
  teamId: string;
  wwdr: string;
  signerCert: string;
  signerKey: string;
  signerKeyPassphrase?: string;
};

export function readAppleWalletCerts(): AppleWalletCerts | null {
  const passTypeId = process.env.APPLE_WALLET_PASS_TYPE_ID?.trim();
  const teamId = process.env.APPLE_WALLET_TEAM_ID?.trim();
  const wwdr = process.env.APPLE_WALLET_WWDR_CERT?.trim();
  const signerCert = process.env.APPLE_WALLET_SIGNER_CERT?.trim();
  const signerKey = process.env.APPLE_WALLET_SIGNER_KEY?.trim();
  if (!passTypeId || !teamId || !wwdr || !signerCert || !signerKey) return null;
  return {
    passTypeId,
    teamId,
    wwdr,
    signerCert,
    signerKey,
    signerKeyPassphrase: process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE?.trim() || undefined,
  };
}

export function isAppleWalletConfigured() {
  return readAppleWalletCerts() !== null;
}

export type GoogleWalletConfig = {
  issuerId: string;
  serviceAccountEmail: string;
  privateKey: string;
  classSuffix: string;
};

export function readGoogleWalletConfig(): GoogleWalletConfig | null {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID?.trim();
  const raw = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON?.trim();
  if (!issuerId || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      issuerId,
      serviceAccountEmail: parsed.client_email,
      privateKey: parsed.private_key,
      classSuffix: process.env.GOOGLE_WALLET_CLASS_SUFFIX?.trim() || "aftermeet_card",
    };
  } catch {
    return null;
  }
}

export function isGoogleWalletConfigured() {
  return readGoogleWalletConfig() !== null;
}

export function walletSetupStatus() {
  return {
    apple: isAppleWalletConfigured(),
    google: isGoogleWalletConfigured(),
  };
}
