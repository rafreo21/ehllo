export function cleanLiveTranscript(raw: string) {
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";

  text = text.replace(/\b(\w+)(?:\s+\1\b)+/gi, "$1");
  text = text.replace(/\b(\w+\s+\w+)(?:\s+\1\b)+/gi, "$1");

  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  const seen = new Set<string>();
  const unique = sentences.filter((sentence) => {
    const key = sentence.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.join(" ").trim();
}

/** Prepare noisy speech-to-text for AI extraction - repair gaps, keep meaning. */
export function normalizeTranscriptForExtraction(raw: string) {
  let text = cleanLiveTranscript(raw);
  if (!text) return "";

  text = text
    .replace(/\b(uh+|um+|erm+|like,\s*|you know,\s*)/gi, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([.!?])\s*(?=[a-z])/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();

  if (!/[.!?]/.test(text) && text.length > 80) {
    text = text
      .replace(/\s+(?:and then|so|but|because|however|anyway|okay|right|then)\s+/gi, ". $1 ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return text;
}
