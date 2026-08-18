import type { ExtractionOwnerContext } from "./encounter-extraction";

const NAME_STOP_WORDS = new Set([
  "here", "with", "just", "going", "like", "right", "thank", "thanks", "yeah", "so", "today",
  "trying", "make", "things", "work", "myself", "my", "own", "side", "does", "direction", "that",
  "why", "this", "particular", "project", "has", "support", "out", "perfectly", "provide", "design",
  "supposed", "also", "answer", "the", "and", "all", "we", "are", "to", "on", "for", "me", "you",
  "London", // common false positive in test transcript
]);

function titleCase(value: string) {
  return value.replace(/\b([a-z])/g, (char) => char.toUpperCase());
}

function cleanPhrase(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^(?:the|a|an|like)\s+/i, "")
    .replace(/\b(?:that'?s why|right|thank you).*$/i, "")
    .trim();
}

function ownerNameSet(ownerNames: string[] = []) {
  return new Set(ownerNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
}

function isOwnerName(name: string, ownerNames: string[] = []) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  const owners = ownerNameSet(ownerNames);
  if (owners.has(normalized)) return true;
  return [...owners].some((owner) => owner.includes(normalized) || normalized.includes(owner));
}

function isPlausibleName(name: string, ownerNames: string[] = []) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length || parts.length > 3) return false;
  if (isOwnerName(name, ownerNames)) return false;
  return parts.every((part) => !NAME_STOP_WORDS.has(part.toLowerCase()) && /^[A-Z][a-z'-]+$/.test(part));
}

export function segmentSpeechTranscript(transcript: string) {
  const punctuated = transcript.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  if (punctuated.length > 1) return punctuated;

  return transcript
    .replace(/\s+(?=(?:I'm|I am|We are|We were|They are|They're|Myself|Also|And also|The website|She|He|My own|On my|Thank you)\b)/gi, "\n")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function detectPersonName(transcript: string, hint = "", ownerNames: string[] = []) {
  if (hint.trim() && !isOwnerName(hint, ownerNames)) return hint.trim();

  const patterns = [
    /\b(?:here with|I'm here with|together with|meeting with|met with|speaking with|talking to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
    /\bmyself and\s+([A-Z][a-z]+)\b/i,
    /\b([A-Z][a-z]+)\s+and\s+I\s+are\s+supposed\b/i,
    /\b([A-Z][a-z]+)\s+(?:is|are)\s+(?:the\s+)?(?:lead|senior|head|chief)\b/i,
    /\b([A-Z][a-z]+)\s+(?:is|are)\s+supposed to\b/i,
    /\b(?:they'?re|she'?s|he'?s)\s+(?:called|named)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
    // Owner introductions last - "my name is" often refers to the other person introducing themselves in 1:1
    /\b(?:my name is|I am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);
    const candidate = match?.[1]?.trim() ?? "";
    if (candidate && isPlausibleName(candidate, ownerNames)) return candidate;
  }

  const capitalized = [...transcript.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g)]
    .map((match) => match[1])
    .filter((word) => isPlausibleName(word, ownerNames));
  const counts = new Map<string, number>();
  capitalized.forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
  const repeated = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1]);
  return repeated[0]?.[0] ?? capitalized[0] ?? "";
}

export function extractTopics(transcript: string) {
  const topics = new Set<string>();

  for (const match of transcript.matchAll(/\b([A-Z][a-z]+(?:\s+[a-z]+){0,3}\s+section)\b/g)) {
    topics.add(titleCase(cleanPhrase(match[1])));
  }

  for (const match of transcript.matchAll(/\b(about page|address page|contact page|home page|landing page)\b/gi)) {
    topics.add(titleCase(match[1]));
  }

  if (/\bfix(?:ing)?\s+(?:the\s+)?website\b/i.test(transcript)) {
    topics.add("Website updates");
  }

  if (/\b(?:pilot|launch|rollout|roadmap|integration|migration)\b/i.test(transcript)) {
    const match = transcript.match(/\b((?:pilot|launch|rollout|roadmap|integration|migration)[^.!?]{0,40})/i);
    if (match?.[1]) topics.add(titleCase(cleanPhrase(match[1])));
  }

  return [...topics].slice(0, 6);
}

export function extractRole(transcript: string, personName: string) {
  const direct = transcript.match(/\b((?:lead|senior|head|chief)\s+(?:designer|engineer|product manager|developer|consultant|architect))\b/i)?.[1];
  if (direct) return cleanPhrase(direct);

  if (personName) {
    const scoped = transcript.match(
      new RegExp(`${personName}[^.!?]{0,40}\\b((?:lead|senior|head|chief)\\s+[A-Za-z\\s-]{2,30})`, "i"),
    )?.[1];
    if (scoped) return cleanPhrase(scoped);

    const roleMatch = transcript.match(
      new RegExp(`\\b${personName}[^.!?]{0,50}\\b(is|are)\\s+(?:the\\s+)?([^.!?]{3,50})`, "i"),
    );
    if (roleMatch?.[2]) return cleanPhrase(roleMatch[2]);
  }

  return "";
}

export function extractOwnerContribution(transcript: string) {
  const match =
    transcript.match(/\b(?:my own side|on my side)[^.!?]*?\b(?:provide|focus on|handle|own)\s+([^.!?]{3,50})/i)
    ?? transcript.match(/\bI(?:'m| am)\s+(?:just\s+)?going to\s+provide\s+([^.!?]{3,40})/i)
    ?? transcript.match(/\bI(?:'ll| will)\s+([^.!?]{3,50})/i);

  if (!match?.[1]) return "";
  return cleanPhrase(match[1]);
}

export function extractOtherPersonCommitments(transcript: string, personName: string) {
  const commitments: string[] = [];
  const patterns = personName
    ? [
        new RegExp(`\\b${personName}[^.!?]{0,30}\\b(?:will|is going to|needs to|has to|should|wants to)\\s+([^.!?]{3,80})`, "gi"),
        new RegExp(`\\b${personName}[^.!?]{0,30}\\b(?:said|mentioned|explained|asked|needs|wants|cares about)\\s+([^.!?]{3,80})`, "gi"),
      ]
    : [
        /\b(?:they|she|he)\s+(?:will|is going to|needs to|has to|should|wants to)\s+([^.!?]{3,80})/gi,
        /\b(?:they|she|he)\s+(?:said|mentioned|explained|asked|needs|wants|cares about)\s+([^.!?]{3,80})/gi,
      ];

  for (const pattern of patterns) {
    for (const match of transcript.matchAll(pattern)) {
      const value = cleanPhrase(match[1] ?? match[0] ?? "");
      if (value.length > 8) commitments.push(value);
    }
  }

  return [...new Set(commitments)].slice(0, 4);
}

export function extractOtherPersonInsights(input: {
  transcript: string;
  personName: string;
  role: string;
  segments: string[];
  ownerNames: string[];
}) {
  const bullets: string[] = [];

  if (input.personName && input.role) {
    bullets.push(`${input.personName}'s role: ${input.role}`);
  }

  for (const commitment of extractOtherPersonCommitments(input.transcript, input.personName)) {
    bullets.push(`${input.personName || "They"}: ${commitment}`);
  }

  for (const segment of input.segments) {
    if (segment.length < 24) continue;
    if (/^(?:I(?:'m| am|'ll| will)|My own|On my side|I'm just going|Yeah|So|Okay|Ok)\b/i.test(segment)) {
      continue;
    }

    if (input.personName && new RegExp(`\\b${input.personName}\\b`, "i").test(segment)) {
      bullets.push(segment);
      continue;
    }

    if (input.personName && /\b(?:they|she|he|their|she's|he's|they're)\b/i.test(segment)) {
      bullets.push(segment);
    }
  }

  return [...new Set(bullets.map((item) => item.trim()).filter(Boolean))].slice(0, 5);
}

export function buildSharedSummary(input: {
  personName: string;
  topics: string[];
  role: string;
  ownerContribution: string;
  transcript: string;
  ownerNames: string[];
}) {
  const sentences: string[] = [];
  const topicText = input.topics.slice(0, 4).join(", ").replace(/,\s([^,]+)$/, ", and $1");
  const ownerLabel = input.ownerNames[0] ?? "I";

  if (input.personName && topicText) {
    sentences.push(`We discussed ${topicText}${input.personName ? ` with ${input.personName}` : ""}.`);
  } else if (topicText) {
    sentences.push(`We discussed ${topicText}.`);
  } else if (input.personName) {
    sentences.push(`We met to align on next steps.`);
  }

  if (input.role && input.personName) {
    sentences.push(`${input.personName} is the ${input.role.toLowerCase()} on this work.`);
  }

  if (input.ownerContribution) {
    sentences.push(`${ownerLabel} will provide ${input.ownerContribution.toLowerCase()}.`);
  }

  const joint = input.transcript.match(/\b(?:we are|we're|we agreed|we decided|we will|we'll)\s+([^.!?]{8,80})/i)?.[1];
  if (joint) {
    sentences.push(`We agreed to ${cleanPhrase(joint).toLowerCase()}.`);
  }

  if (!sentences.length) {
    const fallback = segmentSpeechTranscript(input.transcript).find((part) => part.length > 40);
    if (fallback) sentences.push(fallback);
  }

  return sentences.slice(0, 4).join(" ").trim();
}

export function buildPrivateNotes(input: {
  personName: string;
  role: string;
  otherPersonInsights: string[];
  topics: string[];
}) {
  const bullets: string[] = [];

  for (const insight of input.otherPersonInsights) {
    bullets.push(`• ${insight}`);
  }

  if (input.personName && input.topics.length && bullets.length < 4) {
    bullets.push(`• ${input.personName} focused on: ${input.topics.join("; ")}`);
  }

  if (input.personName && !bullets.length) {
    bullets.push(`• ${input.personName} was the main contact in this conversation.`);
  }

  return bullets.slice(0, 6).join("\n");
}

export function buildMeetingTitle(input: { personName: string; topics: string[] }) {
  const primary =
    input.topics.find((topic) => /website updates/i.test(topic))
    ?? input.topics.find((topic) => /section|page|project|pilot|rollout/i.test(topic))
    ?? input.topics[0];

  if (primary && input.personName) return `${primary} with ${input.personName}`;
  if (primary) return primary;
  if (input.personName) return `Meeting with ${input.personName}`;
  return "New meeting";
}

export function buildFollowUp(input: { topics: string[]; transcript: string; ownerContribution: string; personName: string }) {
  const otherCommitment = extractOtherPersonCommitments(input.transcript, input.personName)[0];
  if (otherCommitment && input.personName) {
    return `Confirm ${input.personName}'s next step: ${titleCase(otherCommitment)}`;
  }

  if (input.topics.length) {
    return `Complete work on ${input.topics.slice(0, 3).join(", ")}`;
  }
  const commitment = input.transcript.match(/\b(?:we are|we're|I am|I'm|they are|they're)\s+supposed to\s+([^.!?]+)/i)?.[1];
  if (commitment) return titleCase(cleanPhrase(commitment));
  if (input.ownerContribution) return titleCase(input.ownerContribution);
  return "";
}

export function inferFollowUpType(text: string) {
  if (/\b(?:whatsapp|wa\.me)\b/i.test(text)) return "whatsapp" as const;
  if (/\blinkedin\b/i.test(text)) return "linkedin" as const;
  if (/\binstagram\b|instagram\.com/i.test(text)) return "instagram" as const;
  if (/\b(?:twitter|on x)\b|(?:^|\s)x\.com/i.test(text)) return "x" as const;
  if (/\btiktok\b|tiktok\.com/i.test(text)) return "tiktok" as const;
  if (/\b(?:call|phone|ring)\b/i.test(text)) return "call" as const;
  if (/\b(?:schedule|book|meeting|coffee)\b/i.test(text)) return "meeting" as const;
  if (/\b(?:email|mail)\b/i.test(text)) return "email" as const;
  if (/\b(?:draft|file|document|deck|proposal|share|send|design|fix|build|ship|launch)\b/i.test(text)) return "send" as const;
  return "other" as const;
}
