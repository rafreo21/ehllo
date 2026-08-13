import { readEnv } from '@/lib/env';

export async function fetchBrandedQrDataUri(slug: string, accessToken: string, size = 512) {
  const env = readEnv();
  if (!env?.publicCardBaseUrl) {
    throw new Error('ehllo API URL is not configured.');
  }

  const response = await fetch(
    `${env.publicCardBaseUrl}/api/mobile/share-assets/${encodeURIComponent(slug)}?type=branded-qr&size=${size}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || 'Could not generate a branded QR code.');
  }

  const payload = await response.json() as { dataUri?: string };
  if (!payload.dataUri?.trim()) {
    throw new Error('Could not generate a branded QR code.');
  }

  return payload.dataUri.trim();
}
