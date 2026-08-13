export type ExtractedEventInfo = {
  title: string;
  location: string;
  startsAt: string | null;
  endsAt: string | null;
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function readMetaContent(html: string, property: string): string {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const match = html.match(pattern) || html.match(new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  ));
  return match ? decodeHtmlEntities(match[1].trim()) : "";
}

function readTitleTag(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? decodeHtmlEntities(match[1].trim()) : "";
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return Number.isNaN(Date.parse(value)) ? null : value.trim();
}

function locationFromJsonLdValue(location: unknown): string {
  if (typeof location === "string") return location.trim();
  if (location && typeof location === "object") {
    const record = location as Record<string, unknown>;
    if (typeof record.name === "string") return record.name.trim();
    const address = record.address;
    if (typeof address === "string") return address.trim();
    if (address && typeof address === "object") {
      const addressRecord = address as Record<string, unknown>;
      return [addressRecord.streetAddress, addressRecord.addressLocality, addressRecord.addressCountry]
        .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
        .join(", ");
    }
  }
  return "";
}

/**
 * Reads structured schema.org Event data (name/startDate/endDate/location)
 * out of any JSON-LD block on the page. This is the one source trusted for
 * dates and location — free-text guessing from prose is deliberately not
 * attempted, per "don't invent missing information": a paste-link import
 * with a blank date/location is better than one with a wrong one.
 */
function jsonLdRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdRecords);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [record, ...jsonLdRecords(record["@graph"]), ...jsonLdRecords(record.itemListElement)];
}

function extractFromJsonLd(html: string, now = new Date()): Partial<ExtractedEventInfo> {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const events: ExtractedEventInfo[] = [];
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1].trim());
    } catch {
      continue;
    }
    const candidates = jsonLdRecords(parsed);
    for (const candidate of candidates) {
      const type = candidate["@type"];
      // Matches "Event" and its schema.org subtypes (SocialEvent, BusinessEvent,
      // MusicEvent, Festival's sibling types, etc. — all end in "Event" except
      // Festival itself, handled by name below), which real event platforms
      // (Eventbrite, Meetup, etc.) use instead of the bare "Event" type.
      const isEventType = (value: unknown) =>
        typeof value === "string" && (value === "Event" || value === "Festival" || value.endsWith("Event"));
      const isEvent = Array.isArray(type) ? type.some(isEventType) : isEventType(type);
      if (!isEvent) continue;
      const startsAt = isoOrNull(candidate.startDate);
      const endsAt = isoOrNull(candidate.endDate);
      events.push({
        title: typeof candidate.name === "string" ? candidate.name.trim() : "",
        location: locationFromJsonLdValue(candidate.location),
        startsAt,
        endsAt: startsAt && endsAt && Date.parse(endsAt) > Date.parse(startsAt) ? endsAt : null,
      });
    }
  }
  if (!events.length) return {};

  // Some event platforms leave multiple Event records in a page. Prefer the
  // nearest future record; if every record is past, use the most recent one
  // so the caller can explicitly ask the user to review the stale date.
  const withValidDates = events.filter((event) => event.startsAt);
  const future = withValidDates
    .filter((event) => Date.parse(event.startsAt!) > now.getTime())
    .sort((left, right) => Date.parse(left.startsAt!) - Date.parse(right.startsAt!));
  if (future.length) return future[0];
  const past = withValidDates.sort((left, right) => Date.parse(right.startsAt!) - Date.parse(left.startsAt!));
  return past[0] ?? events[0];
}

/**
 * Extracts what it confidently can from a pasted event page's HTML: title
 * from JSON-LD/og:title/<title>, location/dates only from JSON-LD. Missing
 * fields come back empty/null rather than guessed — the caller (the "Add
 * event" flow) is expected to ask the user to fill in whatever's missing,
 * not silently invent it.
 */
export function extractEventInfoFromHtml(html: string, now = new Date()): ExtractedEventInfo {
  const structured = extractFromJsonLd(html, now);
  const title = structured.title?.trim()
    || readMetaContent(html, "og:title")
    || readTitleTag(html);

  return {
    title: title.trim().slice(0, 160),
    location: (structured.location ?? "").trim().slice(0, 320),
    startsAt: structured.startsAt ?? null,
    endsAt: structured.endsAt ?? null,
  };
}
