import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  CaretRight,
  ContactlessPayment,
  EnvelopeSimple,
  Monitor,
  PencilSimple,
  QrCode,
  ShareNetwork,
  SquaresFour,
  Wallet,
  Watch,
} from 'phosphor-react-native';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { EmptyState } from '@/components/empty-state';
import { CardToolErrorSheet } from '@/components/card-tool-error-sheet';
import { CardToolSuccessSheet } from '@/components/card-tool-success-sheet';
import { BackButton, Body, Button, Panel } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import {
  BackgroundToolSheetContent,
  cardToolInitials,
  cardToolShowCompany,
  NfcToolSheetContent,
  SignatureToolSheetContent,
  WalletToolSheetContent,
  WatchToolSheetContent,
  WidgetToolSheetContent,
} from '@/features/card/card-tool-sheets';
import { syncCardToolsForCard } from '@/features/card/card-tools-sync';
import { useCard } from '@/features/card/card-context';
import { themeSurfaceStyle } from '@/features/card/theme-colors';
import { fetchWalletAvailability } from '@/features/card/wallet-actions';
import { buildHtmlSignature, buildPlainSignature } from '@/lib/email-signature';
import { fetchBrandedQrDataUri } from '@/lib/branded-qr-client';
import { describeError } from '@/lib/friendly-error';
import { useAppInsets } from '@/lib/safe-area';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

type ToolSheet = 'none' | 'wallet' | 'nfc' | 'widgets' | 'signature' | 'watch' | 'background';

type ToolRowProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  isLast?: boolean;
};

function ToolRow({ icon, title, subtitle, onPress, isLast = false }: ToolRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.toolRow, isLast && styles.toolRowLast, pressed && styles.toolRowPressed]}>
      <View style={styles.toolIcon}>{icon}</View>
      <View style={styles.toolCopy}>
        <Text style={styles.toolTitle}>{title}</Text>
        <Text style={styles.toolSubtitle}>{subtitle}</Text>
      </View>
      <CaretRight size={18} color={colors.muted} weight="bold" />
    </Pressable>
  );
}

export default function CardToolsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { cards, card: activeCard, getCardById, cardPublicUrl } = useCard();
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const insets = useAppInsets();
  const card = useMemo(
    () => (id ? getCardById(String(id)) : undefined),
    [getCardById, id],
  );
  const publicUrl = card ? cardPublicUrl(card) : '';
  const showCompany = card ? cardToolShowCompany(card) : false;
  const theme = useMemo(
    () => themeSurfaceStyle(card?.theme || colors.accent),
    [card?.theme],
  );

  const [activeSheet, setActiveSheet] = useState<ToolSheet>('none');
  const [errorSheetOpen, setErrorSheetOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successSheetOpen, setSuccessSheetOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');
  const [walletAvailable, setWalletAvailable] = useState<boolean | null>(null);
  const [walletNote, setWalletNote] = useState('');

  useEffect(() => {
    if (!id && activeCard.id) {
      router.replace(`/card-tools?id=${activeCard.id}`);
    }
  }, [activeCard.id, id]);

  useFocusEffect(
    useCallback(() => {
      if (!card || !accessToken) return;
      void syncCardToolsForCard(cards, cardPublicUrl, accessToken, card);
    }, [accessToken, card, cards, cardPublicUrl]),
  );

  useEffect(() => {
    if (!card || !accessToken || card.status !== 'published' || !card.slug) {
      void Promise.resolve().then(() => {
        setWalletAvailable(null);
        setWalletNote('');
      });
      return;
    }

    let cancelled = false;
    void fetchWalletAvailability(card.slug, accessToken).then((result) => {
      if (cancelled) return;
      setWalletAvailable(result.available);
      setWalletNote(result.message);
    }).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [accessToken, card]);

  const initials = card ? cardToolInitials(card) : 'AM';
  const subtitle = card ? [card.role, showCompany ? card.company : ''].filter(Boolean).join(' · ') : '';
  const signatureProfile = useMemo(() => ({
    name: card?.name || '',
    role: card?.role || '',
    company: card?.company || '',
    cardUrl: publicUrl,
    showCompany,
    photoUrl: card?.photo,
    email: card?.methods.find((method) => method.type === 'email')?.value,
    phone: card?.methods.find((method) => method.type === 'phone')?.value,
    themeColor: card?.theme,
  }), [card, publicUrl, showCompany]);

  const run = useCallback(async (
    action: string,
    task: () => Promise<void>,
    options?: { successMessage?: string },
  ) => {
    setBusy(action);
    try {
      await task();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (options?.successMessage?.trim()) {
        // Close the open tool sheet before showing the confirmation sheet -
        // two RN <Modal> instances visible at once hangs on iOS, which is
        // why this confirmation never appeared even though it was wired up.
        setActiveSheet('none');
        setSuccessMessage(options.successMessage.trim());
        setSuccessSheetOpen(true);
      }
    } catch (caught) {
      const nextMessage = describeError(caught, 'Something went wrong.');
      setActiveSheet('none');
      setErrorMessage(nextMessage);
      setErrorSheetOpen(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy('');
    }
  }, []);

  const showSuccess = useCallback((nextMessage: string) => {
    const trimmed = nextMessage.trim();
    if (!trimmed) return;
    setActiveSheet('none');
    setSuccessMessage(trimmed);
    setSuccessSheetOpen(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const showError = useCallback((nextMessage: string) => {
    setActiveSheet('none');
    setErrorMessage(nextMessage);
    setErrorSheetOpen(true);
  }, []);

  const sheetActions = useMemo(() => ({
    busy,
    run,
  }), [busy, run]);

  function openSheet(next: ToolSheet) {
    setErrorSheetOpen(false);
    setErrorMessage('');
    setSuccessSheetOpen(false);
    setSuccessMessage('');
    setActiveSheet(next);
  }

  function closeSheet() {
    setActiveSheet('none');
  }

  function closeErrorSheet() {
    setErrorSheetOpen(false);
    setErrorMessage('');
  }

  function closeSuccessSheet() {
    setSuccessSheetOpen(false);
    setSuccessMessage('');
  }

  async function shareCardLink() {
    if (!card) return;
    await Share.share({
      title: `${card.name} · ehllo`,
      message: `${card.name}\n${subtitle}\n${publicUrl}`.trim(),
      url: publicUrl,
    });
  }

  async function copySignature(kind: 'plain' | 'html') {
    if (!card) return;

    try {
      let qrDataUri: string | undefined;
      if (kind === 'html' && card.slug && session?.access_token) {
        try {
          qrDataUri = await fetchBrandedQrDataUri(card.slug, session.access_token);
        } catch {
          qrDataUri = undefined;
        }
      }

      const value = kind === 'plain'
        ? buildPlainSignature(signatureProfile)
        : buildHtmlSignature({ ...signatureProfile, qrDataUri });
      await Clipboard.setStringAsync(value);
      setCopied(kind);
      setTimeout(() => setCopied(''), 1500);
      showSuccess(kind === 'plain' ? 'Plain signature copied.' : 'HTML signature copied.');
    } catch (caught) {
      showError(describeError(caught, 'Could not copy the signature.'));
    }
  }

  if (!card) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top + spacing.x2, paddingHorizontal: spacing.x5 }]}>
        <BackButton onPress={() => router.back()} />
        <Panel style={{ marginTop: spacing.x4 }}>
          <Text style={styles.panelTitle}>Card not found</Text>
          <Body>This card may have been deleted.</Body>
          <Button onPress={() => router.replace('/(tabs)/card')}>Go to my cards</Button>
        </Panel>
      </View>
    );
  }

  const published = card.status === 'published';
  const sharedSheetProps = {
    card,
    publicUrl,
    theme,
    actions: sheetActions,
    accessToken: session?.access_token,
  };

  return (
    <View style={[styles.safe, { paddingTop: insets.top + spacing.x2 }]}>
      <View style={styles.page}>
        <View style={styles.header}>
          <BackButton onPress={() => router.back()} />
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{card.label || card.name || 'Untitled card'}</Text>
            <Body style={styles.subtitle}>
              Share from your phone first. Wallet, NFC, and extras live below.
            </Body>
            <View style={styles.cardMetaRow}>
              <View style={styles.themeMeta}>
                <View style={[styles.themeSwatch, { backgroundColor: theme.backgroundColor }]} />
                <Text style={styles.themeCode}>{theme.backgroundColor}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit this card"
                onPress={() => router.push(`/edit-card?id=${card.id}`)}
                style={styles.editLink}>
                <PencilSimple size={14} color={colors.ink} weight="bold" />
                <Text style={styles.editLinkText}>Edit card</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.x6 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {!session ? (
            <EmptyState
              illustration={require('@/assets/animations/card-tools.json')}
              title="Sign in to sync tools"
              copy="Publish your card first, then unlock Wallet and NFC on this device."
              primaryLabel="Sign in"
              onPrimary={() => router.push('/auth')}
            />
          ) : !published ? (
            <Panel>
              <Text style={styles.panelTitle}>Publish your card</Text>
              <Body>Wallet passes and NFC need a live public link.</Body>
              <Button onPress={() => router.push(`/edit-card?id=${card.id}`)}>Edit and publish</Button>
            </Panel>
          ) : null}

          {published ? (
            <Panel style={styles.heroPanel}>
              <Text style={styles.sectionLabel}>Quick share</Text>
              <View style={styles.heroActions}>
                <Button onPress={() => router.push(`/share-card?id=${card.id}`)}>
                  <QrCode size={18} color={colors.white} weight="bold" />
                  Show QR
                </Button>
                <Button variant="secondary" onPress={() => void shareCardLink()}>
                  <ShareNetwork size={18} color={colors.ink} weight="bold" />
                  Share link
                </Button>
              </View>
            </Panel>
          ) : null}

          <Panel style={styles.toolList}>
            <Text style={styles.sectionLabel}>Share on device</Text>
            <ToolRow
              icon={<Wallet size={22} color={colors.ink} weight="bold" />}
              title="Wallet"
              subtitle={Platform.OS === 'ios'
                ? 'Add your pass to Apple Wallet'
                : 'Add your pass to Google Wallet'}
              onPress={() => openSheet('wallet')}
            />
            <ToolRow
              icon={<ContactlessPayment size={22} color={colors.ink} weight="bold" />}
              title="NFC"
              subtitle="Tap to share on Android, or program NFC tags"
              onPress={() => openSheet('nfc')}
              isLast
            />
          </Panel>

          <Panel style={styles.toolList}>
            <Text style={styles.sectionLabel}>More tools</Text>
            <ToolRow
              icon={<SquaresFour size={22} color={colors.ink} weight="bold" />}
              title="Home screen widgets"
              subtitle="QR, card and recent connections"
              onPress={() => openSheet('widgets')}
            />
            <ToolRow
              icon={<EnvelopeSimple size={22} color={colors.ink} weight="bold" />}
              title="Email signature"
              subtitle="Copy plain text or HTML for your inbox"
              onPress={() => openSheet('signature')}
            />
            <ToolRow
              icon={<Watch size={22} color={colors.ink} weight="bold" />}
              title="Smart watch"
              subtitle="Download a QR for your watch face"
              onPress={() => openSheet('watch')}
            />
            <ToolRow
              icon={<Monitor size={22} color={colors.ink} weight="bold" />}
              title="Virtual background"
              subtitle="Meeting background with your card QR"
              onPress={() => openSheet('background')}
              isLast
            />
          </Panel>
        </ScrollView>
      </View>

      <BottomSheet visible={activeSheet === 'wallet'} title="Wallet" onClose={closeSheet}>
        <WalletToolSheetContent
          {...sharedSheetProps}
          showCompany={showCompany}
          walletAvailable={walletAvailable}
          walletNote={walletNote}
        />
      </BottomSheet>

      <BottomSheet visible={activeSheet === 'nfc'} title="NFC" onClose={closeSheet}>
        <NfcToolSheetContent
          {...sharedSheetProps}
          actions={sheetActions}
        />
      </BottomSheet>

      <BottomSheet
        visible={activeSheet === 'widgets'}
        title="Home screen widgets"
        onClose={closeSheet}
        footer={(
          // Pinned rather than sitting under the gallery. It was the last thing in a
          // scrolling list of three widget previews, so the one action on the sheet was the
          // hardest thing on it to reach.
          <Button
            loading={busy === 'widget'}
            onPress={() => void run('widget', async () => {
              // rethrow: this is the one caller of syncCardToolsForCard where a person is
              // explicitly asking whether the sync worked, not a background sync riding along
              // on some other screen - see the comment on syncCardToolsForCard for why every
              // other caller stays best-effort. Without it, run()'s catch never fires and the
              // success toast below fires unconditionally, even when the sync failed.
              await syncCardToolsForCard(cards, cardPublicUrl, session?.access_token, card, { rethrow: true });
            }, { successMessage: 'Widget data refreshed. Add or update ehllo from your widget picker.' })}>
            Refresh home-screen widgets
          </Button>
        )}>
        <WidgetToolSheetContent
          {...sharedSheetProps}
          allCards={cards}
          cardPublicUrl={cardPublicUrl}
          showCompany={showCompany}
          initials={initials}
        />
      </BottomSheet>

      <BottomSheet visible={activeSheet === 'signature'} title="Email signature" onClose={closeSheet}>
        <SignatureToolSheetContent
          card={card}
          publicUrl={publicUrl}
          signatureProfile={signatureProfile}
          initials={initials}
          showCompany={showCompany}
          copied={copied}
          copySignature={copySignature}
        />
      </BottomSheet>

      <BottomSheet visible={activeSheet === 'watch'} title="Smart watch" onClose={closeSheet}>
        <WatchToolSheetContent
          {...sharedSheetProps}
          published={published}
        />
      </BottomSheet>

      <BottomSheet visible={activeSheet === 'background'} title="Virtual background" onClose={closeSheet}>
        <BackgroundToolSheetContent
          {...sharedSheetProps}
          published={published}
          subtitle={subtitle}
        />
      </BottomSheet>

      <CardToolErrorSheet
        visible={errorSheetOpen}
        message={errorMessage}
        onClose={closeErrorSheet}
      />

      <CardToolSuccessSheet
        visible={successSheetOpen}
        message={successMessage}
        onClose={closeSuccessSheet}
        lottieSource={require('@/assets/animations/wallet-added.json')}
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
  headerCopy: { gap: spacing.x2 },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    marginTop: spacing.x2,
  },
  themeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    paddingHorizontal: spacing.x2,
    paddingVertical: 6,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  themeSwatch: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(22, 51, 0, 0.12)',
  },
  themeCode: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.medium, fontWeight: '700',
    letterSpacing: 0.2,
  },
  editLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editLinkText: { color: colors.ink, fontSize: 13, fontFamily: fonts.medium, fontWeight: '700' },
  title: {
    color: colors.ink,
    fontSize: 28,
    lineHeight: 30,
    fontFamily: fonts.medium, fontWeight: '700',
    letterSpacing: -1.1,
  },
  subtitle: { marginTop: 2 },
  scroll: { flex: 1, marginTop: spacing.x4 },
  scrollContent: {
    paddingHorizontal: spacing.x5,
    gap: spacing.x4,
  },
  panelTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.bold, fontWeight: '800' },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.bold, fontWeight: '800',
    letterSpacing: 0.4,
    paddingHorizontal: spacing.x1,
    paddingTop: spacing.x2,
    paddingBottom: spacing.x1,
  },
  heroPanel: { gap: spacing.x3 },
  heroActions: { gap: spacing.x2 },
  toolList: { gap: 0, paddingVertical: spacing.x1 },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    paddingVertical: spacing.x4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  toolRowLast: {
    borderBottomWidth: 0,
  },
  toolRowPressed: { opacity: 0.72 },
  toolIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolCopy: { flex: 1, gap: 2 },
  toolTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, fontWeight: '800' },
  toolSubtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
