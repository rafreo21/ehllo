function unescapeVcard(value: string) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function cleanUrl(value: string) {
  return unescapeVcard(value).split(/\s/)[0]?.trim() ?? '';
}

export function parseEhlloCardSlugFromUrl(value: string) {
  return parseEhlloCardFromUrl(value)?.slug ?? null;
}

/**
 * The origin matters as much as the slug. A card QR carries a full URL, and
 * until now only the /c/<slug> path was read - so a production card scanned by
 * the staging app produced a slug that environment has never heard of. The
 * scan queued, the server could not resolve it, and the retry loop hammered a
 * request that could never succeed while telling the user their people list
 * was to blame.
 */
export function parseEhlloCardFromUrl(value: string): { slug: string; origin: string } | null {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    const match = parsed.pathname.match(/\/c\/([^/?#]+)/i);
    const slug = match?.[1]?.trim().toLowerCase();
    return slug ? { slug, origin: parsed.origin.toLowerCase() } : null;
  } catch {
    return null;
  }
}

/**
 * Whether a scanned card belongs to the environment this app talks to. Cards
 * live in one backend only, so a mismatch is never recoverable by retrying.
 */
export function isSameEhlloEnvironment(scannedOrigin: string, apiBaseUrl: string) {
  try {
    return new URL(apiBaseUrl).host.toLowerCase() === new URL(scannedOrigin).host.toLowerCase();
  } catch {
    return true; // Can't tell - let the server decide rather than blocking a valid scan.
  }
}

function extractSlugFromVcard(vcard: string) {
  const lines = vcard.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const labeledUrl = line.match(/^item\d+\.URL:(.+)$/i);
    if (labeledUrl) {
      const label = lines[index + 1] || '';
      if (/ehllo card/i.test(label)) {
        const slug = parseEhlloCardSlugFromUrl(cleanUrl(labeledUrl[1]));
        if (slug) return slug;
      }
    }

    const urlLine = line.match(/^(?:URL|item\d+\.URL):(.+)$/i);
    if (urlLine) {
      const slug = parseEhlloCardSlugFromUrl(cleanUrl(urlLine[1]));
      if (slug) return slug;
    }

    if (/^NOTE:/i.test(line)) {
      const note = unescapeVcard(line.replace(/^NOTE:/i, ''));
      const matches = note.match(/https?:\/\/[^\s]+/g) ?? [];
      for (const url of matches) {
        const slug = parseEhlloCardSlugFromUrl(url);
        if (slug) return slug;
      }
    }
  }

  return null;
}

/** Resolve an ehllo card slug from a scanned QR payload (URL or embedded vCard). */
export function parseEhlloCardSlugFromScan(raw: string) {
  const value = raw.replace(/^\uFEFF/, '').trim();
  if (!value) return null;

  const slugFromUrl = parseEhlloCardSlugFromUrl(value);
  if (slugFromUrl) return slugFromUrl;

  if (/^BEGIN:VCARD/i.test(value)) {
    return extractSlugFromVcard(value);
  }

  return null;
}
