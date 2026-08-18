import { router } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { consumeAuthReturnPath } from '@/features/encounters/capture-draft';
import { useDeferredMount } from '@/lib/use-deferred-mount';
import { spacing } from '@/theme/tokens';

export default function OnboardingUseCaseScreen() {
  const { completeUseCaseSelection } = useAuth();
  const [saving, setSaving] = useState(false);
  // The illustration is a 1.9MB Lottie; decoding it on mount stutters the push
  // animation that brings this sheet up. Same treatment as every other
  // illustrated sheet.
  const showIllustration = useDeferredMount(true);

  async function continueFlow() {
    if (saving) return;
    setSaving(true);
    await completeUseCaseSelection();
    const path = await consumeAuthReturnPath();
    router.replace((path as '/capture') ?? '/(tabs)');
  }

  return (
    <View style={styles.root}>
      <BottomSheet
        visible
        title="How will you use ehllo?"
        // Team is not available yet, so there is only one real answer here.
        // Dismissing accepts it and moves on rather than stranding the user on
        // an empty route with no way forward.
        onClose={continueFlow}
        footer={
          <>
            <Button onPress={continueFlow} loading={saving}>Just for me</Button>
            <Button variant="secondary" disabled>For my team or company · Soon</Button>
            <Button variant="ghost" onPress={continueFlow}>Decide later</Button>
          </>
        }>
        <View style={styles.illustration}>
          {showIllustration ? (
            <LottieView
              source={require('@/assets/animations/set-up-your-identity.json')}
              autoPlay
              loop
              style={styles.lottie}
            />
          ) : null}
        </View>
        <Body style={styles.copy}>
          Start with your own card. Create it, share it, and keep track of who you meet.
          Shared team spaces with branded cards are coming.
        </Body>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  illustration: {
    alignSelf: 'center',
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.x1,
  },
  lottie: { width: '100%', height: '100%' },
  copy: { textAlign: 'center' },
});
