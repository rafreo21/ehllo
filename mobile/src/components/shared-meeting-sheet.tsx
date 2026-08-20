import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { RecordingPlayback } from '@/components/recording-playback';
import { Body, Button } from '@/components/ui';
import LottieView from 'lottie-react-native';

import { useDeferredMount } from '@/lib/use-deferred-mount';
import {
  fetchSharedMeeting,
  requestMeetingAccess,
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
  const [requesting, setRequesting] = useState(false);
  const [requestState, setRequestState] = useState<'' | 'sent' | 'already'>('');
  const [requestError, setRequestError] = useState('');
  const showIllustration = useDeferredMount(visible);

  useEffect(() => {
    if (!visible || !encounterId || !accessToken) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return undefined;
      setLoading(true);
      setError('');
      setUnavailable('');
      setRequestState('');
      setRequestError('');
      // The previous meeting was left sitting here. Everything else was reset and these two
      // were not, so opening a second meeting showed the first one's title and recap until
      // the fetch returned - and kept showing them entirely if the second one could not be
      // opened. That is why a meeting you had never opened came up titled "Lab Equipment and
      // Cold Room Inventory Alignment": you were looking at the last one, not this one.
      setMeeting(null);
      setShareToken('');
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

  async function askForAccess() {
    if (!accessToken || !encounterId || requesting) return;
    setRequesting(true);
    setRequestError('');
    try {
      const result = await requestMeetingAccess(accessToken, encounterId);
      // It was shared after all - open it rather than leaving them waiting for an answer
      // nobody owes them.
      if (result.alreadyShared) {
        const opened = await fetchSharedMeeting(accessToken, encounterId);
        setMeeting(opened.meeting);
        setShareToken(opened.shareToken);
        setUnavailable('');
        return;
      }
      setRequestState(result.alreadyRequested ? 'already' : 'sent');
    } catch (caught) {
      setRequestError(describeError(caught, 'Could not send that request.'));
    } finally {
      setRequesting(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      // Says what the sheet is for rather than naming a meeting it cannot show. Falling back
      // to the last title was how a request sheet ended up labelled with somebody else's
      // meeting; falling back to "Meeting" would be no better, because at this point we are
      // asking for access, not displaying one.
      title={meeting?.title || (unavailable ? 'Request meeting access' : 'Meeting')}
      onClose={onClose}
      footer={(
        // Together, in the order the decision is made: the action first, then the way out.
        // Request access sat up in the body, a scroll away from Done, so the two halves of
        // one choice were in two different places.
        <View style={styles.footer}>
          {unavailable && !requestState ? (
            <Button loading={requesting} onPress={() => void askForAccess()}>Request access</Button>
          ) : null}
          <Button variant="secondary" onPress={onClose}>Done</Button>
        </View>
      )}>
      {loading && !meeting ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={colors.ink} /></View>
      ) : null}

      {/* Not a dead end any more. An unshared meeting is a decision the host has not made
          yet, so this says that and offers the one thing that can move it - with the same
          illustration treatment as every other outcome sheet, because arriving at a wall of
          plain text reads as an error even when nothing is wrong. */}
      {unavailable ? (
        <View style={styles.gateWrap}>
          <View style={styles.gateArt}>
            {showIllustration ? (
              <LottieView
                source={requestState
                  ? require('@/assets/animations/share.json')
                  : require('@/assets/animations/private-by-default.json')}
                autoPlay
                loop={false}
                style={styles.gateLottie}
              />
            ) : null}
          </View>
          <Text style={styles.gateTitle}>
            {requestState ? 'Asked' : 'Not shared yet'}
          </Text>
          <Body style={styles.centred}>
            {requestState === 'sent'
              ? 'They have been asked. You will be told the moment they share it.'
              : requestState === 'already'
                ? 'You have already asked for this one. They will be told again when they open ehllo.'
                : 'The host has not shared this meeting. You can ask them to.'}
          </Body>
          {requestError ? <Text style={styles.errorText}>{requestError}</Text> : null}
        </View>
      ) : null}
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
  footer: { gap: spacing.x2 },
  gateWrap: { alignItems: 'center', gap: spacing.x3, paddingVertical: spacing.x2 },
  gateArt: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  gateLottie: { width: '100%', height: '100%' },
  gateTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold, fontWeight: '800', textAlign: 'center' },
  meta: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular },
  recordingCard: { gap: spacing.x2, padding: spacing.x4, borderRadius: radius.medium, backgroundColor: colors.canvas },
  recordingNote: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  summaryCard: { gap: spacing.x2, padding: spacing.x4, borderRadius: radius.medium, backgroundColor: colors.canvas },
  summaryLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, fontWeight: '700' },
  summaryText: { color: colors.ink, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
  privacyNote: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular, textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center' },
});
