/** Find longest suffix of `left` that matches a prefix of `right`. */
export function findSuffixPrefixOverlap(left: string, right: string) {
  const max = Math.min(left.length, right.length);
  for (let length = max; length > 0; length -= 1) {
    if (left.endsWith(right.slice(0, length))) return length;
  }
  return 0;
}

/** Merge a finalized speech segment into committed transcript text. */
export function mergeFinalSegment(current: string, segment: string) {
  const committed = current.trim();
  const next = segment.trim();
  if (!next) return committed;
  if (!committed) return next;
  if (next === committed) return committed;
  if (next.startsWith(committed)) return next;
  if (committed.startsWith(next)) return committed;

  const overlap = findSuffixPrefixOverlap(committed, next);
  if (overlap > 0) {
    return `${committed}${next.slice(overlap)}`.replace(/\s+/g, ' ').trim();
  }

  if (committed.endsWith(next)) return committed;

  return `${committed} ${next}`.replace(/\s+/g, ' ').trim();
}

/** Keep only the uncommitted tail of a partial recognition result. */
export function extractInterimTail(committed: string, partial: string) {
  const current = committed.trim();
  const next = partial.trim();
  if (!next) return '';
  if (!current) return next;
  if (next === current) return '';
  if (next.startsWith(current)) return next.slice(current.length).trim();
  if (current.endsWith(next)) return '';

  const overlap = findSuffixPrefixOverlap(current, next);
  if (overlap > 0) return next.slice(overlap).trim();

  return next;
}

export function joinSpeechResults(results: { transcript?: string }[] | undefined) {
  if (!results?.length) return '';
  return results
    .map((result) => result.transcript?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
