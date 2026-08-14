const SPEAKER_LABEL_PATTERN = /\b(Speaker\s+\d+)\s*:/gi;

function canonicalSpeakerLabel(value: string) {
  const number = value.match(/\d+/)?.[0];
  return number ? `Speaker ${number}` : value.trim();
}

export function transcriptSpeakerLabels(transcript: string) {
  const labels: string[] = [];
  let match: RegExpExecArray | null;
  SPEAKER_LABEL_PATTERN.lastIndex = 0;
  while ((match = SPEAKER_LABEL_PATTERN.exec(transcript)) !== null) {
    const label = canonicalSpeakerLabel(match[1]);
    if (!labels.includes(label)) labels.push(label);
  }
  SPEAKER_LABEL_PATTERN.lastIndex = 0;
  return labels;
}

export function renameTranscriptSpeakers(
  transcript: string,
  names: Record<string, string>,
) {
  SPEAKER_LABEL_PATTERN.lastIndex = 0;
  return transcript.replace(SPEAKER_LABEL_PATTERN, (_match, rawLabel: string) => {
    const label = canonicalSpeakerLabel(rawLabel);
    return `${names[label]?.trim() || label}:`;
  });
}

export function renameSpeakerAssignees<
  T extends { assigneeName?: string; owner: 'me' | 'guest'; participantId?: string },
>(
  actions: T[],
  names: Record<string, string>,
  participants: { id: string; name: string }[],
) {
  return actions.map((action) => {
    const currentName = action.assigneeName?.trim();
    if (!currentName) return action;
    const confirmedName = names[canonicalSpeakerLabel(currentName)]?.trim();
    if (!confirmedName) return action;

    if (confirmedName.toLocaleLowerCase() === 'me') {
      const target = participants.find((person) => person.id === action.participantId);
      return {
        ...action,
        assigneeName: target?.name ?? 'Me',
        owner: 'me' as const,
      };
    }

    const participant = participants.find((person) => (
      person.name.trim().toLocaleLowerCase() === confirmedName.toLocaleLowerCase()
    ));
    return {
      ...action,
      assigneeName: confirmedName,
      owner: 'guest' as const,
      participantId: participant?.id ?? action.participantId,
    };
  });
}
