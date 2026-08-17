import { ListChecks, Microphone, Plus, QrCode, Scan } from 'phosphor-react-native';
import { useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { useCard } from '@/features/card/card-context';
import {
  getActiveCaptureController,
  subscribeToActiveCapture,
} from '@/features/encounters/active-capture-controller';
import { createFreshCaptureDraft, writeCaptureDraft } from '@/features/encounters/capture-draft';
import { useTabBarHeight } from '@/lib/safe-area';
import { useDebouncedNavigate } from '@/lib/use-debounced-navigate';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

export function QuickActionsFab() {
  const { card } = useCard();
  const tabBarHeight = useTabBarHeight();
  const navigate = useDebouncedNavigate();
  const [fabOpen, setFabOpen] = useState(false);

  const activeCapture = useSyncExternalStore(
    subscribeToActiveCapture,
    getActiveCaptureController,
    getActiveCaptureController,
  );

  async function startCaptureNow() {
    setFabOpen(false);
    if (activeCapture) {
      navigate({
        pathname: '/capture/new',
        params: { draftId: activeCapture.snapshot.encounterId },
      });
      return;
    }
    const draft = { ...createFreshCaptureDraft(), captureMode: 'recording' as const };
    await writeCaptureDraft(draft);
    navigate({
      pathname: '/capture/new',
      params: { draftId: draft.encounterId, openConsent: '1' },
    });
  }

  const fabBottomOffset = tabBarHeight + spacing.x3;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick actions"
        onPress={() => setFabOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          { bottom: fabBottomOffset },
          pressed && styles.fabPressed,
        ]}>
        <Plus size={24} color={colors.white} weight="bold" />
      </Pressable>

      <BottomSheet visible={fabOpen} title="Quick actions" onClose={() => setFabOpen(false)}>
        <View style={styles.fabOptions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setFabOpen(false);
              if (card.status === 'published') {
                navigate(`/share-card?id=${card.id}`);
              } else {
                navigate(`/edit-card?id=${card.id}`);
              }
            }}
            style={({ pressed }) => [styles.fabOption, pressed && styles.fabOptionPressed]}>
            <View style={styles.fabOptionIcon}>
              <QrCode size={20} color={colors.ink} weight="bold" />
            </View>
            <Text style={styles.fabOptionLabel}>Share my card</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setFabOpen(false);
              navigate('/quick-follow-up');
            }}
            style={({ pressed }) => [styles.fabOption, pressed && styles.fabOptionPressed]}>
            <View style={styles.fabOptionIcon}>
              <ListChecks size={20} color={colors.ink} weight="bold" />
            </View>
            <Text style={styles.fabOptionLabel}>Quick follow-up</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setFabOpen(false);
              navigate('/scanner');
            }}
            style={({ pressed }) => [styles.fabOption, pressed && styles.fabOptionPressed]}>
            <View style={styles.fabOptionIcon}>
              <Scan size={20} color={colors.ink} weight="bold" />
            </View>
            <Text style={styles.fabOptionLabel}>Quick scan</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void startCaptureNow()}
            style={({ pressed }) => [styles.fabOption, pressed && styles.fabOptionPressed]}>
            <View style={styles.fabOptionIcon}>
              <Microphone size={20} color={colors.ink} weight="bold" />
            </View>
            <Text style={styles.fabOptionLabel}>Capture context</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.x5,
    width: 56,
    height: 56,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  fabPressed: { opacity: 0.88 },
  fabOptions: { gap: spacing.x2 },
  fabOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x3,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  fabOptionPressed: { opacity: 0.9 },
  fabOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  fabOptionLabel: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, fontWeight: '800' },
});
