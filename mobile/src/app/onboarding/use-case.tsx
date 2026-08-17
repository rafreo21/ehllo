import { router } from 'expo-router';
import { ArrowRight, Buildings, Check, User } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Title } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { consumeAuthReturnPath } from '@/features/encounters/capture-draft';
import { useAppInsets } from '@/lib/safe-area';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

export default function OnboardingUseCaseScreen() {
  const { completeUseCaseSelection } = useAuth();
  const insets = useAppInsets();
  const [saving, setSaving] = useState(false);

  async function continueFlow() {
    if (saving) return;
    setSaving(true);
    await completeUseCaseSelection();
    const path = await consumeAuthReturnPath();
    router.replace((path as '/capture') ?? '/(tabs)');
  }

  return (
    <View style={styles.root}>
      <View style={styles.backdrop} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.x4) }]}>
        <View style={styles.handle} />
        <Title style={styles.title}>How will you use ehllo?</Title>
        <View style={styles.choices}>
          <View style={[styles.choice, styles.choiceSelected]}>
            <View style={[styles.choiceIcon, styles.choiceIconSelected]}>
              <User size={22} color={colors.ink} weight="bold" />
            </View>
            <View style={styles.choiceCopy}>
              <Text style={styles.choiceTitleSelected}>For me only</Text>
              <Text style={styles.choiceBodySelected}>Create and share your own card.</Text>
            </View>
            <View style={styles.checkBadge}>
              <Check size={14} color={colors.ink} weight="bold" />
            </View>
          </View>
          <View style={styles.choiceDisabled}>
            <View style={styles.choiceIconDisabled}>
              <Buildings size={22} color={colors.muted} weight="bold" />
            </View>
            <View style={styles.choiceCopy}>
              <View style={styles.choiceTitleRow}>
                <Text style={styles.choiceTitleMuted} numberOfLines={1}>For my team or company</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>SOON</Text>
                </View>
              </View>
              <Text style={styles.choiceBody}>Branded cards for your team.</Text>
            </View>
          </View>
        </View>
        <Button onPress={continueFlow} loading={saving} style={styles.continueButton}>
          Continue <ArrowRight size={20} color={colors.white} weight="bold" />
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(22, 51, 0, 0.48)' },
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: {
    paddingTop: spacing.x3,
    paddingHorizontal: spacing.x5,
    borderTopLeftRadius: radius.large,
    borderTopRightRadius: radius.large,
    backgroundColor: colors.surface,
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 24,
    gap: spacing.x4,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: radius.round,
    backgroundColor: colors.line,
  },
  title: { fontFamily: fonts.regular, fontSize: 32, lineHeight: 34, letterSpacing: -1.1 },
  choices: { gap: spacing.x3, marginTop: spacing.x1 },
  choice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    borderWidth: 2,
  },
  choiceSelected: {
    borderColor: colors.accentPressed,
    backgroundColor: colors.surface,
    shadowColor: colors.accentPressed,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  choiceDisabled: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  choiceIconSelected: { backgroundColor: colors.accentPressed },
  choiceIconDisabled: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  choiceCopy: { flex: 1, gap: spacing.x1 },
  checkBadge: {
    marginTop: 2,
    width: 22,
    height: 22,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentPressed,
  },
  choiceTitleSelected: { color: colors.ink, fontSize: 16, fontFamily: fonts.extrabold, fontWeight: '800' },
  choiceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  choiceTitleMuted: { color: colors.inkSoft, fontSize: 16, fontFamily: fonts.extrabold, fontWeight: '800', flexShrink: 1 },
  choiceBodySelected: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  choiceBody: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  badge: {
    flexShrink: 0,
    paddingHorizontal: spacing.x2,
    paddingVertical: 3,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  badgeText: { color: colors.inkSoft, fontSize: 10, fontFamily: fonts.black, fontWeight: '900', letterSpacing: 0.4 },
  continueButton: { width: '100%' },
});
