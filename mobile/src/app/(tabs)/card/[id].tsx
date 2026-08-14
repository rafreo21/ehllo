import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { PencilSimple, ShareNetwork, Star, Trash, Wrench } from 'phosphor-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { CardDeleteSheet } from '@/components/card-delete-sheet';
import { MakePrimarySheet } from '@/components/make-primary-sheet';
import { OnlyCardPrimarySheet } from '@/components/only-card-primary-sheet';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { OutcomeSuccessSheet } from '@/components/outcome-success-sheet';
import { MobileCardPreview } from '@/components/mobile-card';
import { BackButton, Button, Eyebrow, HeaderActionButton } from '@/components/ui';
import { cardDisplayLabel } from '@/features/card/card-display';
import { useCard } from '@/features/card/card-context';
import { useAppInsets, useTabBarHeight } from '@/lib/safe-area';
import { colors, radius, spacing } from '@/theme/tokens';

export default function CardDetailScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useTabBarHeight();
  const insets = useAppInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    cards,
    getCardById,
    card,
    activeCardId,
    isPrimaryCard,
    setPrimaryCard,
    deleteCard,
  } = useCard();

  const selected = (id ? getCardById(id) : undefined) || card;
  const primary = isPrimaryCard(selected.id || '');
  const currentPrimary = useMemo(
    () => cards.find((item) => item.id === activeCardId),
    [activeCardId, cards],
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [primarySheetOpen, setPrimarySheetOpen] = useState(false);
  const [onlyCardSheetOpen, setOnlyCardSheetOpen] = useState(false);
  const [primaryBusy, setPrimaryBusy] = useState(false);
  const [errorSheetOpen, setErrorSheetOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [deleteSuccessOpen, setDeleteSuccessOpen] = useState(false);
  const navigatingToEdit = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const tabNav = navigation.getParent();
      tabNav?.setOptions({ tabBarStyle: { display: 'none' } });
      navigatingToEdit.current = false;
      return () => {
        tabNav?.setOptions({
          tabBarStyle: {
            height: tabBarHeight,
            paddingTop: 8,
            paddingBottom: Math.max(12, tabBarHeight - 56),
            borderTopColor: colors.line,
            backgroundColor: colors.surface,
          },
        });
      };
    }, [navigation, tabBarHeight]),
  );

  function openEditor() {
    if (navigatingToEdit.current) return;
    navigatingToEdit.current = true;
    router.push(`/edit-card?id=${selected.id}`);
  }

  async function confirmDelete() {
    if (!selected.id) return;
    setDeleting(true);
    try {
      await deleteCard(selected.id);
      setDeleteOpen(false);
      setDeleteSuccessOpen(true);
    } catch (caught) {
      setErrorMessage(caught instanceof Error ? caught.message : 'Could not delete this card.');
      setErrorSheetOpen(true);
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const onlyCard = cards.length <= 1;

  function requestPrimaryChange(nextValue: boolean) {
    if (!selected.id || !nextValue || primary) return;
    if (onlyCard) {
      setOnlyCardSheetOpen(true);
      return;
    }
    if (activeCardId && activeCardId !== selected.id) {
      setPrimarySheetOpen(true);
      return;
    }
    void setPrimaryCard(selected.id);
  }

  async function confirmMakePrimary() {
    if (!selected.id) return;
    setPrimaryBusy(true);
    try {
      await setPrimaryCard(selected.id);
      setPrimarySheetOpen(false);
    } catch (caught) {
      setErrorMessage(caught instanceof Error ? caught.message : 'Could not update your primary card.');
      setErrorSheetOpen(true);
      setPrimarySheetOpen(false);
    } finally {
      setPrimaryBusy(false);
    }
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top + spacing.x2 }]}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <BackButton onPress={() => router.back()} />
            <View style={styles.headerActions}>
              <HeaderActionButton
                accessibilityLabel="Edit card"
                onPress={openEditor}>
                <PencilSimple size={20} color={colors.ink} weight="bold" />
              </HeaderActionButton>
              <HeaderActionButton
                accessibilityLabel="Delete card"
                onPress={() => setDeleteOpen(true)}
                style={styles.headerIconButtonDanger}>
                <Trash size={20} color={colors.danger} weight="bold" />
              </HeaderActionButton>
            </View>
          </View>
          <View style={styles.headerCopy}>
            <Eyebrow>Viewing</Eyebrow>
            <Text style={styles.detailTitle}>{cardDisplayLabel(selected)}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + spacing.x6 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.badges}>
            <Text style={styles.status}>{selected.status === 'published' ? 'Published' : 'Draft'}</Text>
            {primary ? (
              <View style={styles.primaryBadge}>
                <Star size={12} color={colors.ink} weight="fill" />
                <Text style={styles.primaryText}>Primary card</Text>
              </View>
            ) : null}
          </View>

          <MobileCardPreview card={selected} />

          <Pressable
            accessibilityRole="button"
            disabled={!onlyCard}
            onPress={() => setOnlyCardSheetOpen(true)}
            style={[styles.primaryToggleRow, onlyCard && styles.primaryToggleRowDisabled]}>
            <View style={styles.primaryToggleCopy}>
              <Text style={styles.primaryToggleTitle}>Make this card primary</Text>
              <Text style={styles.primaryToggleHint}>
                {onlyCard
                  ? 'This is your only card, so it stays primary on Home.'
                  : 'Your primary card appears on the Share step on Home.'}
              </Text>
            </View>
            <Switch
              value={primary}
              disabled={onlyCard}
              onValueChange={requestPrimaryChange}
              trackColor={{ false: colors.line, true: colors.accent }}
              thumbColor={colors.white}
            />
          </Pressable>

          <Button onPress={() => router.push(`/share-card?id=${selected.id}`)}>
            <ShareNetwork size={18} color={colors.white} weight="bold" />
            Share this card
          </Button>
          <Button variant="secondary" onPress={() => router.push(`/card-tools?id=${selected.id}`)}>
            <Wrench size={18} color={colors.ink} weight="bold" />
            Card tools
          </Button>
        </ScrollView>
      </View>

      <OnlyCardPrimarySheet
        visible={onlyCardSheetOpen}
        onClose={() => setOnlyCardSheetOpen(false)}
        onError={(message) => {
          setErrorMessage(message);
          setErrorSheetOpen(true);
        }}
      />

      <MakePrimarySheet
        visible={primarySheetOpen}
        nextLabel={cardDisplayLabel(selected)}
        currentLabel={cardDisplayLabel(currentPrimary || selected)}
        loading={primaryBusy}
        onCancel={() => setPrimarySheetOpen(false)}
        onConfirm={() => void confirmMakePrimary()}
      />

      <CardDeleteSheet
        visible={deleteOpen}
        title={cardDisplayLabel(selected)}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
        loading={deleting}
      />

      <OutcomeErrorSheet
        visible={errorSheetOpen}
        message={errorMessage}
        onClose={() => {
          setErrorSheetOpen(false);
          setErrorMessage('');
        }}
      />

      <OutcomeSuccessSheet
        visible={deleteSuccessOpen}
        message="Card deleted."
        onClose={() => {
          setDeleteSuccessOpen(false);
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { flex: 1 },
  header: {
    gap: spacing.x3,
    paddingHorizontal: spacing.x5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
  },
  headerIconButtonDanger: {
    backgroundColor: colors.surface,
  },
  headerCopy: { gap: spacing.x2 },
  detailTitle: {
    color: colors.ink,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -1.1,
  },
  scroll: { flex: 1, marginTop: spacing.x4 },
  scrollContent: {
    paddingHorizontal: spacing.x5,
    gap: spacing.x4,
  },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  status: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  primaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
  },
  primaryText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  primaryToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  primaryToggleCopy: { flex: 1, gap: 4 },
  primaryToggleTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  primaryToggleHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  primaryToggleRowDisabled: { opacity: 0.72 },
});
