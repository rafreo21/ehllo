export function normalizeCardUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/\//, '')}`;
}

export function nfcManufacturerPayload(cardUrl: string, vcard?: string) {
  const url = normalizeCardUrl(cardUrl);
  return {
    format: 'NDEF',
    records: [
      {
        recordType: 'MIME',
        mimeType: 'text/vcard',
        payload: vcard || 'Generate from your Ehllo card contact export.',
      },
      {
        recordType: 'URI',
        url,
        encoding: 'utf-8',
      },
    ],
    instructions:
      'Program NFC Type 2 tags with a vCard MIME record (offline contact save) and a URI record fallback for the card page.',
  };
}
