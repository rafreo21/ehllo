import { CheckCircle, UsersThree } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  renameTranscriptSpeakers,
  transcriptSpeakerLabels,
} from '@/features/encounters/speaker-labels';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

export function SpeakerIdentityEditor({
  transcript,
  attendeeNames,
  onApply,
}: {
  transcript: string;
  attendeeNames: string[];
  onApply: (transcript: string, names: Record<string, string>) => void;
}) {
  const labels = useMemo(() => transcriptSpeakerLabels(transcript), [transcript]);
  const candidates = useMemo(
    () => ['Me', ...Array.from(new Set(attendeeNames.map((name) => name.trim()).filter(Boolean)))],
    [attendeeNames],
  );
  const [names, setNames] = useState<Record<string, string>>(() => (
    Object.fromEntries(labels.map((label) => [label, '']))
  ));

  if (!labels.length) return null;

  const complete = labels.every((label) => names[label]);

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <View style={styles.icon}>
          <UsersThree size={18} color={colors.ink} weight="bold" />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Identify speakers</Text>
          <Text style={styles.hint}>Confirm who each detected voice belongs to.</Text>
        </View>
      </View>

      {labels.map((label) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <View style={styles.choices}>
            {candidates.map((candidate) => {
              const selected = names[label] === candidate;
              return (
                <Pressable
                  key={candidate}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setNames((current) => ({ ...current, [label]: candidate }))}
                  style={[styles.chip, selected && styles.chipSelected]}>
                  {selected ? <CheckCircle size={14} color={colors.ink} weight="fill" /> : null}
                  <Text style={styles.chipText}>{candidate}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        disabled={!complete}
        onPress={() => onApply(renameTranscriptSpeakers(transcript, names), names)}
        style={[styles.apply, !complete && styles.applyDisabled]}>
        <Text style={styles.applyText}>Apply speaker names</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.x4,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  icon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.small,
    backgroundColor: colors.accent,
  },
  headingCopy: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: 15, fontFamily: fonts.extrabold, fontWeight: '800' },
  hint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  row: { gap: spacing.x2 },
  label: { color: colors.ink, fontSize: 12, fontFamily: fonts.extrabold, fontWeight: '800' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 },
  chip: {
    minHeight: 34,
    paddingHorizontal: spacing.x3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.ink, backgroundColor: colors.accent },
  chipText: { color: colors.ink, fontSize: 12, fontFamily: fonts.bold, fontWeight: '700' },
  apply: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.small,
    backgroundColor: colors.accent,
  },
  applyDisabled: { opacity: 0.45 },
  applyText: { color: colors.ink, fontSize: 13, fontFamily: fonts.extrabold, fontWeight: '800' },
});
