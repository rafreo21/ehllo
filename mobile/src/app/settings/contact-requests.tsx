import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ClockCounterClockwise, EnvelopeSimple } from 'phosphor-react-native';
import { useCallback, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { OutcomeSuccessSheet } from '@/components/outcome-success-sheet';
import { Body, Button, HeaderActionButton, PageHeader, Panel, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useCard } from '@/features/card/card-context';
import { connectionAvatarUrl } from '@/features/connections/connection-public-card';
import { methodDisplayName, type MissingMethodType } from '@/features/follow-ups/channel-methods';
import {
  answerContactRequest,
  fetchAnsweredContactRequests,
  fetchIncomingContactRequests,
  type AnsweredContactRequest,
  type ContactRequestGroup,
} from '@/features/follow-ups/contact-requests-api';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

/**
 * Requests other people have made for your contact details.
 *
 * Asking worked, recording it worked, and the notification worked - and then the
 * trail stopped: there was nowhere to say yes or no, so every request sat pending
 * and the person who asked could not tell "hasn't seen it" from "would rather not".
 *
 * Grouped by person and detail, not by request. Somebody who asks for your Instagram
 * after every meeting is one row wanting one answer, not fifteen rows wanting fifteen -
 * and the earlier one-row-per-request list made you type the same handle fifteen times
 * to clear them. One answer now closes the whole group.
 *
 * The value is pre-filled from your own card when you already publish that method,
 * because the common case is somebody asking for something you have simply not sent
 * them yet - not something you need to go and write down.
 */
/** field_type arrives as a string from the server; the label helper takes a closed union. */
function fieldLabel(fieldType: string) {
  return methodDisplayName(fieldType as MissingMethodType);
}

/** Mirrors relativeTime on the web screen, so the two surfaces read the same. */
function relativeTime(iso: string) {
  const parsed = new Date(iso).getTime();
  if (!Number.isFinite(parsed)) return 'recently';
  const minutes = Math.floor((Date.now() - parsed) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** How many times this person has asked, said the way a person would say it. */
function askedCaption(group: ContactRequestGroup) {
  if (group.count <= 1) return `Asked ${relativeTime(group.latestAt)}`;
  return `Asked ${group.count} times · last ${relativeTime(group.latestAt)}`;
}

export default function ContactRequestsScreen() {
  const { session } = useAuth();
  const { card } = useCard();
  const { open } = useLocalSearchParams<{ open?: string }>();
  const [groups, setGroups] = useState<ContactRequestGroup[]>([]);
  const [truncated, setTruncated] = useState(0);
  const [active, setActive] = useState<ContactRequestGroup | null>(null);
  const [shared, setShared] = useState<ContactRequestGroup | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [sheetError, setSheetError] = useState('');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<AnsweredContactRequest[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState('');
  // Arrived from a notification, so the sheet should already be up. A ref because it is a
  // one-shot intent, not state: re-opening on every focus would fight anyone who closed
  // it deliberately, and this screen reloads on every focus.
  const openOnArrival = useRef(open === '1');

  const load = useCallback(async () => {
    if (!session?.access_token) { setLoading(false); return; }
    try {
      const next = await fetchIncomingContactRequests(session.access_token);
      setGroups(next.groups);
      setTruncated(next.truncated);

      // Straight into the sheet when one thing is waiting, which is the usual case right
      // after being told about it. With several, the list is the honest answer: guessing
      // which the notification meant would open the wrong person's request.
      if (openOnArrival.current) {
        openOnArrival.current = false;
        const only = next.groups.length === 1 ? next.groups[0] : null;
        if (only) {
          const method = (card?.methods ?? []).find((candidate) => candidate.type === only.fieldType);
          setValue(method?.value ?? '');
          setSheetError('');
          setActive(only);
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load contact requests.');
    } finally {
      setLoading(false);
    }
    // `session` and `card` whole, not a property or an inline default of either: the
    // compiler infers the object as the dependency, and a narrower or freshly built one
    // does not match, so it drops the memo entirely.
  }, [session, card]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function openHistory() {
    setHistoryOpen(true);
    // Fetched on demand. Most visits here are to answer something, and loading a history
    // nobody opened would slow down the thing they came for.
    if (history || !session?.access_token) return;
    setHistoryError('');
    try {
      setHistory(await fetchAnsweredContactRequests(session.access_token));
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Could not load your answered requests.');
    }
  }

  function openGroup(group: ContactRequestGroup) {
    // Pre-filled from the card, so answering is usually one tap. Seeded here rather
    // than on load: only the open group needs a value, and seeding the whole list meant
    // holding a value per request that was thrown away unread.
    const method = (card?.methods ?? []).find((candidate) => candidate.type === group.fieldType);
    setValue(method?.value ?? '');
    setSheetError('');
    setActive(group);
  }

  async function answer(share: boolean) {
    if (!session?.access_token || !active) return;
    const trimmed = value.trim();
    if (share && !trimmed) {
      setSheetError(`Add your ${fieldLabel(active.fieldType)} before sharing it.`);
      return;
    }
    setBusy(true);
    setSheetError('');
    try {
      await answerContactRequest(session.access_token, { ids: active.ids, share, value: trimmed });
      setGroups((current) => current.filter((item) => item.key !== active.key));
      const answered = active;
      setActive(null);
      // Sharing gets its own sheet, because handing someone your number is a decision -
      // and when it clears fifteen separate asks at once, saying so is the difference
      // between a list that emptied for a reason and a list that looks broken.
      // Added to any history already loaded, so opening it straight after answering shows
      // what just happened rather than a list that predates it.
      setHistory((current) => (current ? [{
        id: answered.ids[0] ?? answered.key,
        requesterName: answered.requesterName,
        fieldType: answered.fieldType,
        shared: share,
        answeredAt: new Date().toISOString(),
        sharedValue: share ? trimmed : '',
      }, ...current] : current));
      if (share) setShared(answered);
      else setMessage('Declined. They have been told.');
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : 'Could not answer this request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      header={(
        <PageHeader
          title="Contact requests"
          description="People asking for a way to reach you."
          rightAction={(
            <HeaderActionButton accessibilityLabel="Answered requests" onPress={() => void openHistory()}>
              {/* The icon the capture screen already uses for history. As a word it wrapped
                  against the title and stacked up. */}
              <ClockCounterClockwise size={21} color={colors.ink} weight="bold" />
            </HeaderActionButton>
          )}
        />
      )}>
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {!loading && !groups.length ? (
        <Panel>
          <View style={styles.emptyWrap}>
            <EnvelopeSimple size={26} color={colors.muted} weight="bold" />
            <Text style={styles.emptyTitle}>Nothing waiting</Text>
            <Text style={styles.emptyCopy}>
              When someone asks for a phone number, email or handle you have not shared, it appears here.
            </Text>
          </View>
        </Panel>
      ) : null}

      {groups.map((group) => (
        <Pressable
          key={group.key}
          accessibilityRole="button"
          accessibilityLabel={`${group.requesterName} asked for your ${fieldLabel(group.fieldType)}`}
          onPress={() => openGroup(group)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
          <Image
            source={connectionAvatarUrl({ name: group.requesterName })}
            style={styles.rowAvatar}
            contentFit="cover"
            transition={200}
            alt={`${group.requesterName} profile photo`}
          />
          <View style={styles.rowCopy}>
            {/* Two lines, never three. The name leads because that is what you recognise, and
                both truncate so every row is the same height as the one above it. */}
            <Text style={styles.rowTitle} numberOfLines={1}>
              {group.requesterName}
            </Text>
            <Text style={styles.rowCaption} numberOfLines={1}>
              Asked for your {fieldLabel(group.fieldType)} · {askedCaption(group).replace('Asked ', '')}
            </Text>
          </View>
          {/* Only when it is more than one ask - a "1" beside a single request is noise,
              and the caption already says when it arrived. */}
          {group.count > 1 ? (
            <View style={styles.countPill}>
              <Text style={styles.countText}>{group.count}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}

      {/* Said plainly rather than hidden, because a list that silently stops looks like
          a list of everything. Answering clears whole people at a time, so the rest
          surface next time this screen loads. */}
      {!loading && truncated > 0 ? (
        <Text style={styles.truncated}>
          {truncated} more {truncated === 1 ? 'person is' : 'people are'} waiting. Answer these and they will appear here.
        </Text>
      ) : null}

      <BottomSheet
        visible={Boolean(active)}
        title={active ? `Share your ${fieldLabel(active.fieldType)}?` : 'Share'}
        onClose={() => { if (!busy) setActive(null); }}
        footer={
          <View style={styles.actions}>
            <Button loading={busy} onPress={() => void answer(true)}>Share it</Button>
            <Button variant="secondary" disabled={busy} onPress={() => void answer(false)}>Not this time</Button>
          </View>
        }>
        {active ? (
          <View style={styles.sheetBody}>
            {/* Short on purpose. The long version explained the whole mechanism at
                somebody trying to do one thing, and the buttons already say what happens. */}
            <Body>
              {active.count > 1
                ? `Asked ${active.count} times. One answer clears them all.`
                : `Only ${active.requesterName} sees it.`}
            </Body>
            {active.followUpTitle ? <Text style={styles.context}>For: {active.followUpTitle}</Text> : null}
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setValue}
              placeholder={`Your ${fieldLabel(active.fieldType)}`}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {sheetError ? <Text style={styles.sheetError}>{sheetError}</Text> : null}
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={historyOpen}
        title="Answered"
        onClose={() => setHistoryOpen(false)}
        footer={<Button variant="secondary" onPress={() => setHistoryOpen(false)}>Close</Button>}>
        {historyError ? <Text style={styles.sheetError}>{historyError}</Text> : null}
        {!historyError && !history ? <Body>Loading…</Body> : null}
        {history && !history.length ? (
          <Body>Nothing answered yet. What you share or decline shows up here.</Body>
        ) : null}
        {history?.map((item) => (
          <View key={item.id} style={styles.historyRow}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.shared ? 'Shared with' : 'Declined'} {item.requesterName}
            </Text>
            <Text style={styles.rowCaption} numberOfLines={1}>
              {fieldLabel(item.fieldType)}
              {item.sharedValue ? ` \u00b7 ${item.sharedValue}` : ''}
              {item.answeredAt ? ` \u00b7 ${relativeTime(item.answeredAt)}` : ''}
            </Text>
          </View>
        ))}
      </BottomSheet>

      <OutcomeSuccessSheet
        visible={Boolean(shared)}
        title={shared ? `Shared with ${shared.requesterName}` : 'Shared'}
        message={
          shared
            ? shared.count > 1
              ? `Your ${fieldLabel(shared.fieldType)} is on its way, and all ${shared.count} of their requests are closed. They have been told.`
              : `Your ${fieldLabel(shared.fieldType)} is on its way. They have been told.`
            : ''
        }
        lottieSource={require('@/assets/animations/share.json')}
        onClose={() => setShared(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  message: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13, marginBottom: spacing.x2 },
  // Deliberately identical to personRow on Home. These were radius.large with a border,
  // which read as a different kind of object from every other list of people in the app.
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x3,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
  },
  rowPressed: { opacity: 0.9 },
  rowAvatar: { width: 40, height: 40, borderRadius: radius.round, backgroundColor: colors.surfaceMuted },
  rowCopy: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, fontWeight: '800' },
  rowCaption: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 15 },
  countPill: {
    minWidth: 28, borderRadius: radius.round, backgroundColor: colors.accent,
    paddingVertical: 4, paddingHorizontal: spacing.x2, alignItems: 'center',
  },
  countText: { color: colors.ink, fontFamily: fonts.bold, fontWeight: '800', fontSize: 12 },
  truncated: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  sheetBody: { gap: spacing.x3 },
  context: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  input: {
    minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: spacing.x3, color: colors.ink, fontFamily: fonts.regular, fontSize: 15,
    backgroundColor: colors.surface,
  },
  sheetError: { color: colors.danger, fontFamily: fonts.medium, fontSize: 13 },
  historyRow: { gap: 2, paddingVertical: spacing.x2, borderBottomWidth: 1, borderBottomColor: colors.line },
  actions: { gap: spacing.x2 },
  emptyWrap: { alignItems: 'center', gap: spacing.x2, paddingVertical: spacing.x3 },
  emptyTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  emptyCopy: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
