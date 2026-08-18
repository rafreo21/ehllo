import { useFocusEffect } from 'expo-router';
import { EnvelopeSimple } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, PageHeader, Panel, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useCard } from '@/features/card/card-context';
import { methodDisplayName, type MissingMethodType } from '@/features/follow-ups/channel-methods';
import {
  answerContactRequest,
  fetchIncomingContactRequests,
  type IncomingContactRequest,
} from '@/features/follow-ups/contact-requests-api';
import { colors, fonts, spacing } from '@/theme/tokens';

/**
 * Requests other people have made for your contact details.
 *
 * Asking worked, recording it worked, and the notification worked - and then the
 * trail stopped: there was nowhere to say yes or no, so every request sat pending
 * and the person who asked could not tell "hasn't seen it" from "would rather not".
 *
 * The value is pre-filled from your own card when you already publish that method,
 * because the common case is somebody asking for something you have simply not sent
 * them yet - not something you need to go and write down.
 */
/** field_type arrives as a string from the server; the label helper takes a closed union. */
function fieldLabel(fieldType: string) {
  return methodDisplayName(fieldType as MissingMethodType);
}

export default function ContactRequestsScreen() {
  const { session } = useAuth();
  const { card } = useCard();
  // Read the one field the loader needs, so the callback can be memoized on it
  // rather than on the whole card object.
  const cardMethods: { type: string; value: string }[] = card?.methods ?? [];
  const [requests, setRequests] = useState<IncomingContactRequest[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session?.access_token) { setLoading(false); return; }
    try {
      const next = await fetchIncomingContactRequests(session.access_token);
      setRequests(next);
      setValues((current) => {
        const seeded = { ...current };
        for (const request of next) {
          if (seeded[request.id] !== undefined) continue;
          // Pre-fill from the card, so answering is usually one tap.
          const method = cardMethods.find((candidate) => candidate.type === request.fieldType);
          seeded[request.id] = method?.value ?? '';
        }
        return seeded;
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load contact requests.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, cardMethods]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function answer(request: IncomingContactRequest, share: boolean) {
    if (!session?.access_token) return;
    const value = (values[request.id] ?? '').trim();
    if (share && !value) {
      setMessage(`Add your ${fieldLabel(request.fieldType)} before sharing it.`);
      return;
    }
    setBusyId(request.id);
    setMessage('');
    try {
      await answerContactRequest(session.access_token, { id: request.id, share, value });
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setMessage(share ? 'Shared. They have been told.' : 'Declined. They have been told.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not answer this request.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <Screen header={<PageHeader title="Contact requests" description="People asking for a way to reach you." />}>
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {!loading && !requests.length ? (
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

      {requests.map((request) => (
        <Panel key={request.id}>
          <Text style={styles.field}>{fieldLabel(request.fieldType)}</Text>
          {request.followUpTitle ? <Text style={styles.context}>For: {request.followUpTitle}</Text> : null}
          <TextInput
            style={styles.input}
            value={values[request.id] ?? ''}
            onChangeText={(text) => setValues((current) => ({ ...current, [request.id]: text }))}
            placeholder={`Your ${fieldLabel(request.fieldType)}`}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.actions}>
            <Button loading={busyId === request.id} onPress={() => void answer(request, true)}>Share it</Button>
            <Button
              variant="secondary"
              disabled={busyId === request.id}
              onPress={() => void answer(request, false)}>
              Not this time
            </Button>
          </View>
        </Panel>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  message: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13, marginBottom: spacing.x2 },
  field: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, fontWeight: '800' },
  context: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: 2 },
  input: {
    marginTop: spacing.x3, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: spacing.x3, color: colors.ink, fontFamily: fonts.regular, fontSize: 15,
    backgroundColor: colors.surface,
  },
  actions: { gap: spacing.x2, marginTop: spacing.x3 },
  emptyWrap: { alignItems: 'center', gap: spacing.x2, paddingVertical: spacing.x3 },
  emptyTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  emptyCopy: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
