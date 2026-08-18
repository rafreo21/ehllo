import { useEffect, useState } from 'react';
import LottieView from 'lottie-react-native';
import { CalendarBlank, EnvelopeSimple, Handshake } from 'phosphor-react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { fetchSharedHistory, type SharedHistoryItem } from '@/features/connections/shared-history-api';
import { useDeferredMount } from '@/lib/use-deferred-mount';
import { describeError } from '@/lib/friendly-error';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function itemIcon(kind: SharedHistoryItem['kind']) {
  if (kind === 'email') return <EnvelopeSimple size={17} color={colors.ink} weight="fill" />;
  if (kind === 'event_invite') return <CalendarBlank size={17} color={colors.ink} weight="fill" />;
  return <Handshake size={17} color={colors.ink} weight="fill" />;
}

/** One line saying what happened, in words rather than field names. */
function describeItem(item: SharedHistoryItem, personName: string) {
  const them = personName.trim() || 'them';
  if (item.kind === 'met') {
    return item.eventTitle ? `You met at ${item.eventTitle}` : `You and ${them} connected`;
  }
  if (item.kind === 'event_invite') {
    const who = item.direction === 'outbound' ? `You invited ${them}` : `${them} invited you`;
    const event = item.eventTitle ? ` to ${item.eventTitle}` : '';
    const answer = item.status && item.status !== 'invited' ? ` · ${item.status}` : '';
    return `${who}${event}${answer}`;
  }
  const direction = item.direction === 'outbound' ? 'You emailed' : 'They emailed you';
  return item.subject ? `${direction}: ${item.subject}` : direction;
}

/**
 * The history both people can see.
 *
 * Kept separate from the meeting timeline on the connection screen on purpose.
 * That one is your private record of this person - captures, notes, completed
 * follow-ups. This one is only what they can see too, and the sheet says so
 * outright, because a list that mixes the two turns the privacy boundary into
 * something the user has to infer.
 */
export function SharedHistorySheet({
  visible,
  connectionId,
  personName,
  accessToken,
  onClose,
}: {
  visible: boolean;
  connectionId: string | null;
  personName: string;
  accessToken: string | null;
  onClose: () => void;
}) {
  const [items, setItems] = useState<SharedHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const showIllustration = useDeferredMount(visible);

  useEffect(() => {
    if (!visible || !connectionId || !accessToken) return;
    let cancelled = false;
    // Deferred a microtask so the loading state lands after this render rather
    // than during it, which is what react-hooks/set-state-in-effect is guarding
    // against. Same treatment the house bottom sheet uses.
    void Promise.resolve().then(() => {
      if (cancelled) return undefined;
      setLoading(true);
      setError('');
      return fetchSharedHistory(accessToken, connectionId)
        .then((history) => {
          if (!cancelled) setItems(history.items);
        })
        .catch((caught) => {
          if (!cancelled) setError(describeError(caught, 'Could not load what you both can see.'));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => { cancelled = true; };
  }, [visible, connectionId, accessToken]);

  // "met" always exists, so anything more than that is real shared activity.
  const hasActivity = items.some((item) => item.kind !== 'met');

  return (
    <BottomSheet
      visible={visible}
      title="What you both see"
      onClose={onClose}
      footer={<Button variant="secondary" onPress={onClose}>Done</Button>}>
      {loading && !items.length ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {!loading && !error && !hasActivity ? (
        <>
          <View style={styles.illustration}>
            {showIllustration ? (
              <LottieView
                source={require('@/assets/animations/connection-captured.json')}
                autoPlay
                loop
                style={styles.lottie}
              />
            ) : null}
          </View>
          <Body style={styles.copy}>
            Just the fact that you met, so far. Invitations and emails between you will show up here, on both sides.
          </Body>
        </>
      ) : null}

      {!error && hasActivity ? (
        <>
          <Body style={styles.copy}>
            {personName.trim() || 'They'} can see this too. Your notes, captures and drafts stay private.
          </Body>
          <View style={styles.list}>
            {items.map((item, index) => (
              <View key={`${item.kind}-${item.at ?? index}-${index}`} style={styles.row}>
                <View style={styles.marker}>{itemIcon(item.kind)}</View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{describeItem(item, personName)}</Text>
                  {formatWhen(item.at) ? <Text style={styles.rowMeta}>{formatWhen(item.at)}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { paddingVertical: spacing.x6, alignItems: 'center' },
  illustration: { alignSelf: 'center', width: 168, height: 168, alignItems: 'center', justifyContent: 'center' },
  lottie: { width: '100%', height: '100%' },
  copy: { textAlign: 'center' },
  list: { gap: spacing.x2 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas },
  marker: {
    width: 30,
    height: 30,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.medium, fontWeight: '700', lineHeight: 20 },
  rowMeta: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular },
  errorText: { color: colors.danger, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center' },
});
