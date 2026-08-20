/**
 * A card slug has two spellings, and anything resolving one has to accept both.
 *
 * Auto-generated slugs are "card-" plus 16 hex characters, and both wallet passes
 * encode the slug without the prefix - those five characters are the difference
 * between a 33x33 QR and a 29x29 one, which is the difference between a code that
 * scans across a table and one that does not. Every other surface (the app's own QR,
 * NFC tags, widgets, the branded QR behind the email signature, watch face and
 * virtual background, and the web page) carries the full slug.
 *
 * app/c/[slug] worked this out and handled it inline, so the public card page resolved
 * both forms while nothing else did. link_people_connection_from_scan matches
 * `c.slug = lower(trim(p_slug))` exactly and raises 'card not found' otherwise - so
 * scanning a card from Apple or Google Wallet could not create a connection at all,
 * on mobile or on the web. Not a duplicate: a failure.
 *
 * Order matters and is not arbitrary. The slug exactly as given is tried first, so a
 * real card whose own chosen slug happens to look like a bare 16-hex code still wins
 * over a prefixed guess.
 */
const GENERATED_SLUG_BODY = /^[a-f0-9]{16}$/;

/** Normalised spellings to try, in priority order, for a slug arriving from anywhere. */
export function cardSlugCandidates(slug: string | null | undefined): string[] {
  const normalized = (slug ?? "").trim().toLowerCase();
  if (!normalized) return [];
  // Only the generated shape gets a prefixed alternative. A custom slug that merely
  // looks short is somebody's chosen address, and guessing "card-" onto it could
  // resolve to a different person's card entirely.
  if (GENERATED_SLUG_BODY.test(normalized)) {
    return [normalized, `card-${normalized}`];
  }
  return [normalized];
}

/**
 * The slug as stored on the card, given whichever spelling arrived. Returns null when
 * no published card answers to any spelling, which callers should treat as not found
 * rather than as an error worth retrying.
 */
export async function resolveStoredCardSlug(
  slug: string | null | undefined,
  lookup: (candidate: string) => Promise<string | null>,
): Promise<string | null> {
  for (const candidate of cardSlugCandidates(slug)) {
    const found = await lookup(candidate);
    if (found) return found;
  }
  return null;
}
