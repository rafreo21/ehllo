export function buildEmailShareUrl(cardUrl: string, cardName: string) {
  const subject = encodeURIComponent(`${cardName}'s AfterMeet card`);
  const body = encodeURIComponent(`Here is my card: ${cardUrl}`);
  return `mailto:?subject=${subject}&body=${body}`;
}

export function buildSmsShareUrl(cardUrl: string, cardName: string) {
  const body = encodeURIComponent(`Here is ${cardName}'s AfterMeet card: ${cardUrl}`);
  return `sms:?&body=${body}`;
}

export function buildLinkedInShareUrl(cardUrl: string) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(cardUrl)}`;
}

/** eventTitle is an activator: omit it and this note reads exactly as before. */
export function buildWhenWeMetNote(cardUrl: string, scannedAt = new Date(), eventTitle?: string) {
  const date = scannedAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const trimmedEvent = eventTitle?.trim();
  const whereLine = trimmedEvent ? `Where we met: ${trimmedEvent}\n` : "";
  return `${whereLine}When we met: ${date}\nSaved from AfterMeet\n${cardUrl}`;
}
