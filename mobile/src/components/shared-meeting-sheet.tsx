import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { RecordingPlayback } from '@/components/recording-playback';
import { Body, Button } from '@/components/ui';
import {
  fetchSharedMeeting,
  sharedRecordingUri,
  SharedMeetingUnavailableError,
  type SharedMeeting,
} from '@/features/encounters/shared-meeting-api';
import { describeError } from '@/lib/friendly-error';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

function formatWhen(iso: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatUntil(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * A meeting somebody else recorded, opened from your side of the history.
 *
 * Shows what they shared and nothing more: the summary they approved and the
 * audio, both of which the server gates. It carries no transcript and no private
 * notes, because those never leave their author - and no follow-up actions,
 * because a commitment addressed to you lives in your own Follow-ups where you
 * can act on it.
 *
 * The recording expires three days after the meeting, the same window the emailed
 * link has. The sheet says so while it is still there rather than letting it
 * disappear unexplained.
 */
export function SharedMeetingSheet({
  visible,
  encounterId,
  accessToken,
  onClose,
}: {
  visible: boolean;
  encounterId: string | null;
  accessToken: string | null;
  onClose: () => void;
}) {
  const [meeting, setMeeting] = useState<SharedMeeting | null>(null);
  const [shareToken, setShareToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState('');

  useEffect(() => {
    if (!visible || !encounterId || !accessToken) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return undefined;
      setLoading(true);
      setError('');
      setUnavailable('');
      return fetchSharedMeeting(accessToken, encounterId)
        .then((result) => {
          if (cancelled) return;
          setMeeting(result.meeting);
          setShareToken(result.shareToken);
        })
        .catch((caught) => {
          if (cancelled) return;
          // Not shared is an answer, not a failure, and reads differently.
          if (caught instanceof SharedMeetingUnavailableError) setUnavailable(caught.message);
          else setError(describeError(caught, 'Could not open this meeting.'));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => { cancelled = true; };
  }, [visible, encounterId, accessToken]);

  return (
    <BottomSheet
      visible={visible}
      title={meeting?.title || 'Meeting'}
      onClose={onClose}
      footer={<Button variant="secondary" onPress={onClose}>Done</Button>}>
      {loading && !meeting ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={colors.ink} /></View>
      ) : null}

      {unavailable ? <Body style={styles.centred}>{unavailable}</Body> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {meeting && !unavailable ? (
        <>
          {formatWhen(meeting.startedAt) ? (
            <Text style={styles.meta}>{formatWhen(meeting.startedAt)}</Text>
          ) : null}

          {meeting.hasRecording && shareToken ? (
            <View style={styles.recordingCard}>
              <RecordingPlayback
                uri={sharedRecordingUri(shareToken)}
                durationSeconds={meeting.durationSeconds}
              />
              <Text style={styles.recordingNote}>
                {formatUntil(meeting.recordingExpiresAt)
                  ? `Audio is available until ${formatUntil(meeting.recordingExpiresAt)}.`
                  : 'Audio is available for a few days after the meeting.'}
              </Text>
            </View>
          ) : null}

          {meeting.sharedSummary.trim() ? (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>What was shared</Text>
              <Text style={styles.summaryText}>{meeting.sharedSummary.trim()}</Text>
            </View>
          ) : (
            <Body style={styles.centred}>
              They shared the recording without a written summary.
            </Body>
          )}

          <Text style={styles.privacyNote}>
            You are seeing what {meeting.personName.trim() || 'they'} chose to share. Their notes stay private.
          </Text>
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { paddingVertical: spacing.x6, alignItems: 'center' },
  centred: { textAlign: 'center' },
  meta: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular },
  recordingCard: { gap: spacing.x2, padding: spacing.x4, borderRadius: radius.medium, backgroundColor: colors.canvas },
  recordingNote: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  summaryCard: { gap: spacing.x2, padding: spacing.x4, borderRadius: radius.medium, backgroundColor: colors.canvas },
  summaryLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, fontWeight: '700' },
  summaryText: { color: colors.ink, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
  privacyNote: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular, textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center' },
});
