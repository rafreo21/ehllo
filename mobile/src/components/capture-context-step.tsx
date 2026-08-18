import type { CaptureWizardDraft } from '@/features/encounters/capture-draft';
import { Body, Button } from '@/components/ui';
import { colors, radius, spacing, fonts } from '@/theme/tokens';
import { CheckCircle, Sparkle, TextAlignLeft } from 'phosphor-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type ContextTab = 'context' | 'transcript';

type CaptureContextStepProps = {
  draft: CaptureWizardDraft;
  onDraftChange: (changes: Partial<CaptureWizardDraft>) => void;
  refreshing: boolean;
  isGenerating: boolean;
  isTranscribing?: boolean;
  generationError?: string;
  onRefresh: () => void;
  uncertainFields: string[];
};

export function CaptureContextStep({
  draft,
  onDraftChange,
  refreshing,
  isGenerating,
  isTranscribing = false,
  generationError,
  onRefresh,
  uncertainFields,
}: CaptureContextStepProps) {
  const [tab, setTab] = useState<ContextTab>('context');
  const waitingForDraft = isGenerating && !draft.title.trim() && !draft.sharedSummary.trim();
  const people = draft.people ?? [];

  return (
    <View style={styles.wrapper}>
      <View style={styles.tabs}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'context' }}
          onPress={() => setTab('context')}
          style={[styles.tab, tab === 'context' && styles.tabActive]}>
          <Sparkle size={16} color={tab === 'context' ? colors.ink : colors.muted} weight="fill" />
          <Text style={[styles.tabLabel, tab === 'context' && styles.tabLabelActive]}>Meeting context</Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'transcript' }}
          onPress={() => setTab('transcript')}
          style={[styles.tab, tab === 'transcript' && styles.tabActive]}>
          <TextAlignLeft size={16} color={tab === 'transcript' ? colors.ink : colors.muted} weight="bold" />
          <Text style={[styles.tabLabel, tab === 'transcript' && styles.tabLabelActive]}>Transcript</Text>
          {isTranscribing ? <View style={styles.tabDot} /> : null}
        </Pressable>
      </View>

      {tab === 'context' ? (
        <View style={styles.block}>
          <Body>
            {draft.captureMode === 'quick_context'
              ? 'Write or paste what mattered. ehllo turns it into a reviewed summary and concrete follow-up.'
              : 'We draft a meeting title and share summary from your transcript. Edit either field before you continue.'}
          </Body>

          {waitingForDraft ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color={colors.ink} size="small" />
              <View style={styles.statusText}>
                <Text style={styles.statusTitle}>Turning the conversation into context…</Text>
                <Text style={styles.statusCopy}>Identifying the summary, commitments, and likely follow-ups.</Text>
              </View>
            </View>
          ) : null}

          {!waitingForDraft && (draft.title.trim() || draft.sharedSummary.trim()) ? (
            <View style={[styles.statusRow, styles.readyRow]}>
              <CheckCircle size={20} color={colors.ink} weight="fill" />
              <View style={styles.statusText}>
                <Text style={styles.statusTitle}>Context ready to review</Text>
                <Text style={styles.statusCopy}>{draft.title.trim() || 'Confirm the suggested summary below.'}</Text>
              </View>
            </View>
          ) : null}

          {uncertainFields.length > 0 ? (
            <Text style={styles.uncertain}>Double-check: {uncertainFields.join(', ')}</Text>
          ) : null}

          {generationError ? (
            <Text style={styles.uncertain}>{generationError}</Text>
          ) : null}

          {people.length ? (
            <View style={styles.peopleWrap}>
              <Text style={styles.label}>In this meeting</Text>
              <View style={styles.peopleRow}>
                {people.map((person) => (
                  <View key={person.id} style={styles.personChip}>
                    <Text style={styles.personChipText}>{person.name.trim() || 'Guest'}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <Text style={styles.label}>Meeting title</Text>
          <TextInput
            value={draft.title}
            onChangeText={(value) => onDraftChange({ title: value })}
            placeholder="Product sync with design and eng"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Text style={styles.label}>Share summary</Text>
          <Text style={styles.fieldHint}>
            A clear recap of what was discussed, safe to send to everyone in the room.
          </Text>
          <TextInput
            value={draft.sharedSummary}
            onChangeText={(value) => onDraftChange({ sharedSummary: value })}
            placeholder="What you discussed, decided, and who owns what next…"
            placeholderTextColor={colors.muted}
            multiline
            scrollEnabled
            style={[styles.input, styles.summaryField]}
          />
          <Button variant="secondary" loading={refreshing} onPress={onRefresh}>
            Refresh suggestions
          </Button>
        </View>
      ) : (
        <View style={styles.block}>
          <Body>{draft.captureMode === 'quick_context'
            ? 'Add rough notes, copied messages, or a short recap. This stays private unless you approve a shared summary.'
            : 'This is your private meeting record. Edit it if names or details need correcting before sharing context.'}</Body>
          {isTranscribing ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color={colors.ink} size="small" />
              <Text style={styles.statusCopy}>Still transcribing your recording…</Text>
            </View>
          ) : null}
          <TextInput
            value={draft.transcript}
            onChangeText={(value) => onDraftChange({ transcript: value })}
            placeholder={draft.captureMode === 'quick_context'
              ? 'What happened, what was promised, and what should happen next?'
              : 'Transcript appears here after recording…'}
            placeholderTextColor={colors.muted}
            multiline
            scrollEnabled
            style={[styles.input, styles.transcriptField]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.x4 },
  tabs: {
    flexDirection: 'row',
    gap: spacing.x2,
    padding: spacing.x1,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x2,
    paddingVertical: spacing.x3,
    paddingHorizontal: spacing.x3,
    borderRadius: radius.round,
  },
  tabActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabLabel: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium, fontWeight: '700' },
  tabLabelActive: { color: colors.ink, fontFamily: fonts.bold, fontWeight: '800' },
  tabDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  block: {
    gap: spacing.x4,
    padding: spacing.x5,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  label: { color: colors.muted, fontSize: 11, fontFamily: fonts.bold, fontWeight: '800' },
  fieldHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  peopleWrap: { gap: spacing.x2 },
  peopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 },
  personChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  personChipText: { color: colors.ink, fontSize: 13, fontFamily: fonts.medium, fontWeight: '700' },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.x4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 15,
  },
  summaryField: { minHeight: 180, maxHeight: 260, paddingTop: spacing.x3, textAlignVertical: 'top' },
  transcriptField: { minHeight: 280, maxHeight: 400, paddingTop: spacing.x3, textAlignVertical: 'top' },
  uncertain: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  readyRow: { padding: spacing.x3, borderRadius: radius.medium, backgroundColor: colors.surfaceMuted },
  statusText: { flex: 1, gap: 2 },
  statusTitle: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold, fontWeight: '800' },
  statusCopy: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  errorBox: {
    gap: spacing.x1,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: '#FFF1F1',
    borderWidth: 1,
    borderColor: '#F3CACA',
  },
  errorTitle: { color: colors.danger, fontSize: 13, fontFamily: fonts.bold, fontWeight: '800' },
  errorBody: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
});
