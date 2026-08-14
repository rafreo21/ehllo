import { CheckCircle, Microphone } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { CollapsibleTranscriptSection } from '@/components/collapsible-transcript-section';
import { FollowUpCell } from '@/components/follow-up-cell';
import { RecordingPlayback } from '@/components/recording-playback';
import { Body } from '@/components/ui';
import type { EncounterPayload } from '@/features/encounters/encounter-api';
import type { FollowUpItem } from '@/features/follow-ups/follow-up-api';
import { formatMeetingDate } from '@/lib/due-date';
import { colors, radius, spacing } from '@/theme/tokens';

type MeetingDetailSheetProps = {
  visible: boolean;
  encounter: EncounterPayload | null;
  recordingUri?: string | null;
  followUps: FollowUpItem[];
  /** The linked event's title, if any — event is an activator here: with nothing linked, the meta row is unchanged. */
  eventTitle?: string;
  eventLocation?: string;
  onClose: () => void;
  onPressFollowUp: (item: FollowUpItem) => void;
  onCompleteFollowUp: (item: FollowUpItem) => void;
  onReopenFollowUp?: (item: FollowUpItem) => void;
};

type DetailTab = 'summary' | 'transcript';

export function MeetingDetailSheet({
  visible,
  encounter,
  recordingUri,
  followUps,
  eventTitle,
  eventLocation,
  onClose,
  onPressFollowUp,
  onCompleteFollowUp,
  onReopenFollowUp,
}: MeetingDetailSheetProps) {
  const [tab, setTab] = useState<DetailTab>('summary');

  if (!encounter) return null;

  const consentLabel = encounter.consent?.confirmed
    ? `${encounter.consent.method === 'written' ? 'Written' : 'Verbal'} consent confirmed`
    : 'Consent not recorded';
  const hasSummary = Boolean(encounter.sharedSummary.trim());
  const hasTranscript = Boolean(encounter.transcript.trim());
  const activeTab = tab === 'transcript' && hasTranscript ? 'transcript' : 'summary';

  return (
    <BottomSheet
      visible={visible}
      title={encounter.title.trim() || formatMeetingDate(encounter.startedAt)}
      onClose={onClose}>
      <View style={styles.metaRow}>
        {eventTitle ? (
          <Text style={styles.meta}>
            Where we met: {eventTitle}{eventLocation ? ` · ${eventLocation}` : ''}
          </Text>
        ) : null}
        <Text style={styles.meta}>{formatMeetingDate(encounter.startedAt)}</Text>
      </View>

      {encounter.personName.trim() ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>People in this conversation</Text>
          <Text style={styles.peopleLine}>{encounter.personName.trim()}</Text>
        </View>
      ) : null}

      {recordingUri ? (
        <RecordingPlayback uri={recordingUri} durationSeconds={encounter.durationSeconds} />
      ) : encounter.durationSeconds || encounter.recording ? (
        <Text style={styles.recordingMissing}>Recording is not available on this device yet.</Text>
      ) : null}

      <View style={styles.consentBadge}>
        {encounter.consent?.confirmed ? (
          <CheckCircle size={14} color={colors.ink} weight="fill" />
        ) : (
          <Microphone size={14} color={colors.muted} weight="bold" />
        )}
        <Text style={styles.consentText}>{consentLabel}</Text>
      </View>

      {(hasSummary || hasTranscript) ? (
        <View style={styles.block}>
          <View style={styles.tabs}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setTab('summary')}
              style={[styles.tab, activeTab === 'summary' && styles.tabActive]}>
              <Text style={[styles.tabLabel, activeTab === 'summary' && styles.tabLabelActive]}>
                Shared summary
              </Text>
            </Pressable>
            {hasTranscript ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setTab('transcript')}
                style={[styles.tab, activeTab === 'transcript' && styles.tabActive]}>
                <Text style={[styles.tabLabel, activeTab === 'transcript' && styles.tabLabelActive]}>
                  Transcript
                </Text>
              </Pressable>
            ) : null}
          </View>

          {activeTab === 'summary' ? (
            hasSummary ? (
              <Body>{encounter.sharedSummary.trim()}</Body>
            ) : (
              <Text style={styles.emptyTab}>No shared summary yet.</Text>
            )
          ) : (
            <CollapsibleTranscriptSection value={encounter.transcript} defaultOpen />
          )}
        </View>
      ) : null}

      {followUps.length ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Follow-ups</Text>
          <View style={styles.list}>
            {followUps.map((item) => (
              <FollowUpCell
                key={`${item.encounterId}-${item.actionId}`}
                item={item}
                onPress={() => onPressFollowUp(item)}
                onComplete={() => onCompleteFollowUp(item)}
                onReopen={onReopenFollowUp ? () => onReopenFollowUp(item) : undefined}
              />
            ))}
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  metaRow: { gap: spacing.x2 },
  meta: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  consentBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x2,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceMuted,
  },
  consentText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  block: { gap: spacing.x2 },
  blockTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  peopleLine: { color: colors.inkSoft, fontSize: 14, lineHeight: 20 },
  tabs: {
    flexDirection: 'row',
    gap: spacing.x2,
    padding: 4,
    borderRadius: radius.large,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.x2,
    borderRadius: radius.medium,
  },
  tabActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabLabel: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  tabLabelActive: { color: colors.ink },
  emptyTab: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  recordingMissing: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  list: { gap: spacing.x3 },
});
