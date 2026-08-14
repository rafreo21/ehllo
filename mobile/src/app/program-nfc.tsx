import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowRight,
  CheckCircle,
  ContactlessPayment,
  DeviceMobile,
  WarningCircle,
} from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton, Body, Button, Eyebrow } from '@/components/ui';
import { useCard } from '@/features/card/card-context';
import {
  programNfcTag,
  type NfcProgrammingStage,
} from '@/features/card/nfc-actions';
import { useAppInsets } from '@/lib/safe-area';
import { colors, radius, spacing } from '@/theme/tokens';

type ScreenState = 'ready' | NfcProgrammingStage | 'success' | 'error';

const STEPS = [
  { key: 'waiting-for-tag', label: 'Hold tag to phone' },
  { key: 'reading-tag', label: 'Read tag' },
  { key: 'writing-tag', label: 'Program card link' },
  { key: 'verifying-tag', label: 'Verify tag' },
] as const;

const ACTIVE_ORDER: ScreenState[] = [
  'ready',
  'checking-device',
  'waiting-for-tag',
  'reading-tag',
  'writing-tag',
  'verifying-tag',
  'success',
];

function stateTitle(state: ScreenState) {
  switch (state) {
    case 'checking-device': return 'Checking your phone…';
    case 'waiting-for-tag': return 'Hold the tag near your phone';
    case 'reading-tag': return 'Tag found. Reading…';
    case 'writing-tag': return 'Programming your card…';
    case 'verifying-tag': return 'Checking the result…';
    case 'success': return 'Your NFC tag is ready';
    case 'error': return 'Programming did not finish';
    default: return 'Program an NFC tag';
  }
}

function stateDescription(state: ScreenState) {
  switch (state) {
    case 'checking-device': return 'ehllo is checking NFC support and whether it is enabled.';
    case 'waiting-for-tag': return Platform.OS === 'ios'
      ? 'Place one writable NFC tag near the top of your iPhone and keep it there.'
      : 'Place one writable NFC tag against the back of your phone and keep it there.';
    case 'reading-tag': return 'Keep the tag still while ehllo checks that it can be written.';
    case 'writing-tag': return 'Do not move the tag. ehllo is saving your live card link.';
    case 'verifying-tag': return 'Keep the tag in place while ehllo confirms the card link.';
    case 'success': return 'Tap the tag with another phone to open your live card.';
    case 'error': return 'Nothing was changed unless the write completed. Review the reason below and try again.';
    default: return 'Use one blank or rewritable NDEF tag. ehllo will save your live card link and verify it before finishing.';
  }
}

export default function ProgramNfcScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { getCardById, cardPublicUrl } = useCard();
  const insets = useAppInsets();
  const card = useMemo(() => id ? getCardById(String(id)) : undefined, [getCardById, id]);
  const [state, setState] = useState<ScreenState>('ready');
  const [error, setError] = useState('');

  const running = !['ready', 'success', 'error'].includes(state);
  const currentIndex = ACTIVE_ORDER.indexOf(state);

  async function startProgramming() {
    if (!card || running) return;
    setError('');
    try {
      await programNfcTag(card, cardPublicUrl(card), setState);
      setState('success');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ehllo could not program this NFC tag.');
      setState('error');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  if (!card) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top + spacing.x2 }]}>
        <View style={styles.header}><BackButton /><Text style={styles.headerTitle}>Card not found</Text></View>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top + spacing.x2 }]}>
      <View style={styles.header}>
        <BackButton />
        <View style={styles.headerCopy}>
          <Eyebrow>NFC setup</Eyebrow>
          <Text style={styles.headerTitle}>{card.label || card.name || 'My card'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.x5 }]}>
        <View style={[styles.hero, state === 'success' && styles.heroSuccess, state === 'error' && styles.heroError]}>
          <View style={styles.heroIcon}>
            {running ? <ActivityIndicator color={colors.ink} /> : state === 'success' ? (
              <CheckCircle size={28} color={colors.ink} weight="fill" />
            ) : state === 'error' ? (
              <WarningCircle size={28} color={colors.danger} weight="fill" />
            ) : (
              <ContactlessPayment size={28} color={colors.ink} weight="bold" />
            )}
          </View>
          <Text style={styles.title}>{stateTitle(state)}</Text>
          <Body style={styles.description}>{stateDescription(state)}</Body>
          {state === 'error' && error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        <View style={styles.stepsPanel}>
          {STEPS.map((step, index) => {
            const stepOrder = ACTIVE_ORDER.indexOf(step.key);
            const complete = state === 'success' || currentIndex > stepOrder;
            const active = state === step.key;
            return (
              <View key={step.key} style={[styles.stepRow, index === STEPS.length - 1 && styles.stepRowLast]}>
                <View style={[styles.stepMarker, (complete || active) && styles.stepMarkerActive]}>
                  {complete ? <CheckCircle size={18} color={colors.ink} weight="fill" /> : <Text style={styles.stepNumber}>{index + 1}</Text>}
                </View>
                <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{step.label}</Text>
                {active ? <ActivityIndicator size="small" color={colors.ink} /> : null}
              </View>
            );
          })}
        </View>

        {state === 'ready' ? (
          <View style={styles.tipPanel}>
            <DeviceMobile size={22} color={colors.ink} weight="bold" />
            <View style={styles.tipCopy}>
              <Text style={styles.tipTitle}>Before you begin</Text>
              <Body>Remove thick or magnetic phone cases. Hold only one tag near the phone, and keep it still until verification completes.</Body>
            </View>
          </View>
        ) : null}

        {state === 'success' ? (
          <>
            <Button onPress={() => router.back()}>
              Done
              <ArrowRight size={18} color={colors.white} weight="bold" />
            </Button>
            <Button variant="secondary" onPress={() => setState('ready')}>Program another tag</Button>
          </>
        ) : state === 'error' ? (
          <>
            <Button onPress={() => void startProgramming()}>Try again</Button>
            <Button variant="ghost" onPress={() => router.back()}>Cancel</Button>
          </>
        ) : (
          <Button loading={running} disabled={running} onPress={() => void startProgramming()}>
            Start programming
            <ArrowRight size={18} color={colors.white} weight="bold" />
          </Button>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: spacing.x5, gap: spacing.x3 },
  headerCopy: { gap: spacing.x1 },
  headerTitle: { color: colors.ink, fontSize: 25, lineHeight: 29, fontWeight: '800', letterSpacing: -0.7 },
  content: { paddingHorizontal: spacing.x5, paddingTop: spacing.x4, gap: spacing.x4 },
  hero: { backgroundColor: colors.surface, borderRadius: radius.large, padding: spacing.x5, gap: spacing.x2 },
  heroSuccess: { backgroundColor: colors.surfaceMuted },
  heroError: { borderWidth: 1, borderColor: colors.danger },
  heroIcon: { width: 52, height: 52, borderRadius: radius.medium, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.x2 },
  title: { color: colors.ink, fontSize: 28, lineHeight: 31, fontWeight: '800', letterSpacing: -0.9 },
  description: { color: colors.muted },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: spacing.x2 },
  stepsPanel: { backgroundColor: colors.surface, borderRadius: radius.large, paddingHorizontal: spacing.x4 },
  stepRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.x3, borderBottomWidth: 1, borderBottomColor: colors.line },
  stepRowLast: { borderBottomWidth: 0 },
  stepMarker: { width: 32, height: 32, borderRadius: radius.round, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  stepMarkerActive: { backgroundColor: colors.accent },
  stepNumber: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  stepLabel: { flex: 1, color: colors.muted, fontSize: 15, fontWeight: '700' },
  stepLabelActive: { color: colors.ink },
  tipPanel: { flexDirection: 'row', gap: spacing.x3, backgroundColor: colors.surfaceMuted, borderRadius: radius.large, padding: spacing.x4 },
  tipCopy: { flex: 1, gap: spacing.x1 },
  tipTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
});
