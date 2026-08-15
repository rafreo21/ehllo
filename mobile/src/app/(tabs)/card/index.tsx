import { Plus, Scan } from 'phosphor-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { CardLibraryTile } from '@/components/card-library-tile';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { EmptyState } from '@/components/empty-state';
import { OfflineBanner } from '@/components/offline-banner';
import { QuickActionsFab } from '@/components/quick-actions-fab';
import { CardGridSkeleton } from '@/components/skeleton';

import { Body, Button, Eyebrow, HeaderActionButton, Title } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { MAX_CARDS } from '@/features/card/card-library';
import { useCard } from '@/features/card/card-context';
import { describeError } from '@/lib/friendly-error';
import { useAppInsets, useTabBarHeight } from '@/lib/safe-area';
import { useDebouncedNavigate } from '@/lib/use-debounced-navigate';
import { colors, radius, spacing } from '@/theme/tokens';

export default function CardLibraryScreen() {
  const { session } = useAuth();
  const { cards, activeCardId, syncing, canCreateCard, createCard } = useCard();
  const insets = useAppInsets();
  const tabBarHeight = useTabBarHeight();
  const navigate = useDebouncedNavigate();
  const [errorSheetOpen, setErrorSheetOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const hasCards = cards.length > 0;

  async function startCreateCard(label?: string) {
    try {
      const created = await createCard(label ? { label } : undefined);
      if (created) navigate(`/edit-card?id=${created.id}`);
      else {
        setErrorMessage('You can save a maximum of five cards.');
        setErrorSheetOpen(true);
      }
    } catch (caught) {
      setErrorMessage(describeError(caught, 'Could not create a card.'));
      setErrorSheetOpen(true);
    }
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top + spacing.x2 }]}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.topBar}>
            <View style={styles.headerCopy}>
              <Eyebrow>{syncing ? 'Syncing…' : 'My cards'}</Eyebrow>
              <Title style={styles.title}>
                {session ? 'Choose a card to open' : hasCards ? 'Your cards on this device' : 'Create your first card'}
              </Title>
              <Body>
                {session
                  ? 'Open a card to view, share, or set primary.'
                  : hasCards
                    ? 'Sign in to publish and sync your cards across devices.'
                    : 'Build your card locally, then sign in when you are ready to publish and share it.'}
              </Body>
            </View>
            <HeaderActionButton
              accessibilityLabel="Scan QR code"
              onPress={() => navigate('/scanner')}>
              <Scan size={22} color={colors.ink} weight="bold" />
            </HeaderActionButton>
          </View>
          <OfflineBanner message="Offline. Your cards are saved on this device and will sync once you're back online." />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + spacing.x3 + 56 + spacing.x4 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {!session && !hasCards ? (
            <EmptyState
              illustration={require('@/assets/animations/set-up-your-identity.json')}
              title="Create your first card"
              copy="Add your name, role, and contact methods. Sign in when you are ready to publish."
              primaryLabel="Create card"
              onPrimary={() => void startCreateCard()}
              secondaryLabel="Sign in"
              onSecondary={() => navigate('/auth')}
            />
          ) : null}

          {!session && hasCards ? (
            <Text style={styles.localNote}>Saved on this device only · Sign in to publish and sync</Text>
          ) : null}

          {syncing && !hasCards ? <CardGridSkeleton count={2} /> : null}

          {hasCards ? (
            <View style={styles.grid}>
              {cards.map((item) => (
                <CardLibraryTile
                  key={item.id}
                  card={item}
                  isPrimary={item.id === activeCardId}
                  onPress={() => navigate(`/card/${item.id}`)}
                />
              ))}

              {canCreateCard ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void startCreateCard(`Card ${cards.length + 1}`)}
                  style={({ pressed }) => [styles.addTile, pressed && styles.pressed]}>
                  <View style={styles.addIcon}>
                    <Plus size={24} color={colors.ink} weight="bold" />
                  </View>
                  <Text style={styles.addTitle}>Create another card</Text>
                  <Text style={styles.addCopy}>{MAX_CARDS - cards.length} remaining</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {session && !hasCards ? (
            <EmptyState
              illustration={require('@/assets/animations/set-up-your-identity.json')}
              title="Create your first card"
              copy="Add your identity and the ways people can reach you."
              primaryLabel="Create your first card"
              onPrimary={() => void startCreateCard()}
            />
          ) : null}

          {!session && hasCards ? (
            <Button onPress={() => navigate('/auth')}>Sign in to publish</Button>
          ) : null}
        </ScrollView>
      </View>

      <OutcomeErrorSheet
        visible={errorSheetOpen}
        message={errorMessage}
        onClose={() => {
          setErrorSheetOpen(false);
          setErrorMessage('');
        }}
      />

      <QuickActionsFab />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { flex: 1 },
  header: {
    paddingHorizontal: spacing.x5,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.x3,
  },
  headerCopy: { flex: 1, gap: spacing.x3 },
  title: { fontSize: 32, lineHeight: 34, letterSpacing: -1.1 },
  scroll: { flex: 1, marginTop: spacing.x2 },
  scrollContent: {
    paddingHorizontal: spacing.x5,
    gap: spacing.x3,
  },
  localNote: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  grid: { gap: spacing.x3 },
  pressed: { opacity: 0.92 },
  addTile: {
    padding: spacing.x5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x2,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  addIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.round,
    backgroundColor: colors.surfaceMuted,
  },
  addTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  addCopy: { color: colors.muted, fontSize: 12 },
});
