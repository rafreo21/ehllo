import * as Brightness from 'expo-brightness';
import { router, useLocalSearchParams } from 'expo-router';
import { ContactlessPayment, Scan, ShareNetwork } from 'phosphor-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Share, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { BrandedQrCode, type QrShareMode } from '@/components/branded-qr-code';
import { AppleWalletButton } from '@/components/apple-wallet-button';
import { GoogleWalletButton } from '@/components/google-wallet-button';
import { OutcomeSuccessSheet } from '@/components/outcome-success-sheet';
import { BackButton, Body, Button, Eyebrow, PillButton, ScreenFrame } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useCard } from '@/features/card/card-context';
import { showsCompanyDetails } from '@/features/card/company-display';
import { isEventCurrentlyHappening } from '@/features/events/event-home-state';
import { fetchMyEvents } from '@/features/events/events-api';
import {
  isTapToShareActive,
  isTapToShareNativeReady,
  isTapToShareSupported,
  setTapToShareReadListener,
  startTapToShare,
  stopTapToShare,
  TAP_TO_SHARE_REBUILD_MESSAGE,
} from '@/features/card/nfc-hce-actions';
import {
  addAppleWalletPass,
  addGoogleWalletPass,
  fetchWalletAvailability,
} from '@/features/card/wallet-actions';
import { describeError } from '@/lib/friendly-error';
import { readAppleWalletSaved, writeAppleWalletSaved } from '@/lib/apple-wallet-state';
import { readGoogleWalletSaved, writeGoogleWalletSaved } from '@/lib/google-wallet-state';
import { readQuickShareQrMode, writeQuickShareQrMode } from '@/lib/quick-share-preferences';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

export default function ShareCardScreen() {
  const { id, slug } = useLocalSearchParams<{ id?: string; slug?: string }>();
  const { session } = useAuth();
  const { card: activeCard, cards, getCardById, cardPublicUrl } = useCard();
  const card = (id ? getCardById(id) : undefined)
    || (slug ? cards.find((item) => item.slug === slug) : undefined)
    || activeCard;
  const publicUrl = cardPublicUrl(card);
  const showCompany = showsCompanyDetails(card);
  const tapSupported = isTapToShareSupported();
  const tapNativeReady = isTapToShareNativeReady();
  const [tapActive, setTapActive] = useState(false);
  const [tapBusy, setTapBusy] = useState(false);
  const [tapMessage, setTapMessage] = useState(tapNativeReady ? '' : TAP_TO_SHARE_REBUILD_MESSAGE);
  const [walletAvailable, setWalletAvailable] = useState<boolean | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [googleWalletSaved, setGoogleWalletSaved] = useState(false);
  const [appleWalletSaved, setAppleWalletSaved] = useState(false);
  const [walletNote, setWalletNote] = useState('');
  const [walletConfirmOpen, setWalletConfirmOpen] = useState(false);
  const [walletSuccessOpen, setWalletSuccessOpen] = useState(false);
  const [qrMode, setQrMode] = useState<QrShareMode>('online');
  const onlineQrEnabled = qrMode === 'online';
  const [activeEventTitle, setActiveEventTitle] = useState<string | undefined>(undefined);
  const onlineCardUrl = publicUrl && activeEventTitle
    ? `${publicUrl}?event=${encodeURIComponent(activeEventTitle)}`
    : publicUrl;

  useEffect(() => {
    if (Platform.OS !== 'android' || !card.slug) return;
    void readGoogleWalletSaved(card.slug).then(setGoogleWalletSaved);
  }, [card.slug]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !card.slug) return;
    void readAppleWalletSaved(card.slug).then(setAppleWalletSaved);
  }, [card.slug]);

  useEffect(() => {
    if (!session?.access_token) return;
    let cancelled = false;
    void fetchMyEvents(session.access_token).then((events) => {
      if (cancelled) return;
      const current = events.find((event) => isEventCurrentlyHappening(event));
      setActiveEventTitle(current?.title);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const setOnlineQrEnabled = useCallback((enabled: boolean) => {
    const mode: QrShareMode = enabled ? 'online' : 'offline';
    setQrMode(mode);
    void writeQuickShareQrMode(mode);
  }, []);

  useEffect(() => {
    void readQuickShareQrMode().then(setQrMode);
  }, []);

  useEffect(() => {
    if (!card.slug || !session?.access_token || card.status !== 'published') {
      void Promise.resolve().then(() => {
        setWalletAvailable(null);
        setWalletNote('');
      });
      return;
    }

    let cancelled = false;
    void fetchWalletAvailability(card.slug, session.access_token).then((result) => {
      if (cancelled) return;
      setWalletAvailable(result.available);
      setWalletNote(result.message);
    }).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [card.slug, card.status, session?.access_token]);

  useEffect(() => {
    let original = 0.5;
    Brightness.getBrightnessAsync().then((value) => { original = value; return Brightness.setBrightnessAsync(1); }).catch(() => {});
    return () => {
      Brightness.setBrightnessAsync(original).catch(() => {});
      void stopTapToShare();
      setTapToShareReadListener(null);
    };
  }, []);

  const toggleTapToShare = useCallback(async () => {
    if (!tapSupported) return;

    if (!publicUrl) {
      setTapMessage('Publish your card first so we have a link to share.');
      return;
    }

    setTapBusy(true);
    setTapMessage('');
    try {
      if (tapActive || isTapToShareActive()) {
        await stopTapToShare();
        setTapActive(false);
        setTapMessage('Tap to share turned off.');
        return;
      }

      setTapToShareReadListener(() => {
        setTapMessage('Card link shared by tap.');
      });
      await startTapToShare(onlineCardUrl || publicUrl);
      setTapActive(true);
      setTapMessage('Ready. Ask them to hold their phone against yours.');
    } catch (error) {
      setTapActive(false);
      setTapMessage(describeError(error, 'Could not start tap to share.'));
    } finally {
      setTapBusy(false);
    }
  }, [publicUrl, tapActive, tapSupported]);

  async function shareCard() {
    await Share.share({
      title: `${card.name} · ehllo`,
      message: `${card.name}\n${card.role}${showCompany && card.company ? ` at ${card.company}` : ''}\n${publicUrl}`,
      url: publicUrl,
    });
  }

  async function addToWallet() {
    if (!card.slug || !session?.access_token) return;
    setWalletBusy(true);
    setWalletNote('');
    try {
      if (Platform.OS === 'ios') {
        await addAppleWalletPass(card.slug, session.access_token);
        void writeAppleWalletSaved(card.slug, true);
        setAppleWalletSaved(true);
      } else if (Platform.OS === 'android') {
        await addGoogleWalletPass(card.slug, session.access_token);
        if (!googleWalletSaved) {
          setWalletConfirmOpen(true);
        }
      }
    } catch (error) {
      setWalletNote(describeError(error, 'Could not open Wallet.'));
    } finally {
      setWalletBusy(false);
    }
  }

  function confirmWalletSaved() {
    setWalletConfirmOpen(false);
    if (!card.slug) return;
    void writeGoogleWalletSaved(card.slug, true);
    setGoogleWalletSaved(true);
    setWalletSuccessOpen(true);
  }

  return (
    <ScreenFrame style={styles.frame}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <BackButton onPress={() => router.back()} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quick scan"
            onPress={() => router.push('/scanner')}
            style={({ pressed }) => [styles.scanTopButton, pressed && styles.scanTopButtonPressed]}>
            <Scan size={18} color={colors.ink} weight="bold" />
            <Text style={styles.scanTopLabel}>Quick Scan</Text>
          </Pressable>
        </View>
        <View style={styles.headerCopy}>
          <Eyebrow>Quick Share</Eyebrow>
        </View>
      </View>
      <Body style={styles.cardLine}>
        {card.name}
        {card.role || (showCompany && card.company)
          ? ` · ${[card.role, showCompany ? card.company : ''].filter(Boolean).join(' · ')}`
          : ''}
      </Body>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}>
        {publicUrl ? (
          <View style={styles.qrSection}>
            <View style={styles.qr}>
              <BrandedQrCode
                key={qrMode}
                card={card}
                cardUrl={onlineQrEnabled ? onlineCardUrl : publicUrl}
                mode={qrMode}
                size={280}
                activeEventTitle={activeEventTitle}
              />
            </View>
            <View style={styles.modeToggle}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setOnlineQrEnabled(!onlineQrEnabled)}
                style={styles.modeToggleCopy}>
                <Text style={styles.modeToggleTitle}>
                  {onlineQrEnabled ? 'Online contact QR' : 'Offline contact QR active'}
                </Text>
                <Text style={styles.modeToggleHint}>
                  {onlineQrEnabled
                    ? 'Scans open your card page so visitors can share back.'
                    : 'Scanners save your full contact offline (all fields). Profile photo needs a network when they save.'}
                </Text>
              </Pressable>
              <Switch
                accessibilityLabel={onlineQrEnabled ? 'Online contact QR' : 'Offline contact QR active'}
                value={onlineQrEnabled}
                onValueChange={setOnlineQrEnabled}
                trackColor={{ false: colors.line, true: colors.accent }}
                thumbColor={colors.white}
              />
            </View>
          </View>
        ) : (
          <Text style={styles.helperInline}>Publish your card to generate a QR code.</Text>
        )}
        {tapSupported ? (
          <View style={[styles.tapPanel, tapActive && styles.tapPanelActive]}>
            <Text style={styles.tapTitle}>{tapActive ? 'Tap to share is on' : 'Or tap phones together'}</Text>
            <Text style={styles.tapBody}>
              {tapActive
                ? 'Keep this screen open. Their phone opens your card page over NFC.'
                : 'Turn on tap to share, then hold your phone against theirs.'}
            </Text>
            {tapMessage ? <Text style={styles.tapMessage}>{tapMessage}</Text> : null}
          </View>
        ) : (
          <Text style={styles.helperInline}>
            {walletAvailable
              ? 'Share with the QR code or add your pass to Wallet.'
              : 'Share with the QR code. Wallet opens here once it is configured on the server.'}
          </Text>
        )}
      </ScrollView>
      <View style={styles.actions}>
        {walletAvailable ? (
          Platform.OS === 'android' ? (
            <GoogleWalletButton
              style={styles.actionButton}
              loading={walletBusy}
              mode={googleWalletSaved ? 'view' : 'add'}
              onPress={() => void addToWallet()}
            />
          ) : (
            <AppleWalletButton
              style={styles.actionButton}
              loading={walletBusy}
              mode={appleWalletSaved ? 'view' : 'add'}
              onPress={() => void addToWallet()}
            />
          )
        ) : null}
        {walletNote ? <Text style={styles.walletNote}>{walletNote}</Text> : null}
        <View style={styles.shareActionRow}>
          {tapSupported ? (
            <PillButton
              style={styles.sharePill}
              textStyle={styles.sharePillText}
              tone="solid"
              icon={<ContactlessPayment size={21} color={colors.white} weight="bold" />}
              loading={tapBusy}
              disabled={!publicUrl}
              onPress={() => void toggleTapToShare()}>
              {tapActive ? 'Stop tap to share' : 'Tap to share'}
            </PillButton>
          ) : null}
          <PillButton
            style={styles.sharePill}
            textStyle={styles.sharePillText}
            tone="outline"
            icon={<ShareNetwork size={21} color={colors.muted} weight="bold" />}
            onPress={shareCard}>
            Share
          </PillButton>
        </View>
      </View>
      <Text style={styles.helper}>Brightness is temporarily increased while this screen is open.</Text>
      <BottomSheet
        visible={walletConfirmOpen}
        title="Was the pass added?"
        onClose={() => setWalletConfirmOpen(false)}
        footer={
          <View style={styles.walletConfirmRow}>
            <Button style={styles.walletConfirmButton} variant="secondary" onPress={() => setWalletConfirmOpen(false)}>
              Not yet
            </Button>
            <Button style={styles.walletConfirmButton} onPress={confirmWalletSaved}>
              Yes, added
            </Button>
          </View>
        }>
        <Body>Confirm only after Google Wallet shows that the pass was added.</Body>
      </BottomSheet>
      <OutcomeSuccessSheet
        visible={walletSuccessOpen}
        title="Done"
        message="Saved to Google Wallet."
        lottieSource={require('@/assets/animations/wallet-added.json')}
        onClose={() => setWalletSuccessOpen(false)}
      />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, gap: spacing.x3 },
  header: { gap: spacing.x3 },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCopy: { gap: spacing.x2 },
  scanTopButton: {
    minHeight: 44,
    paddingHorizontal: spacing.x3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  scanTopButtonPressed: { opacity: 0.82 },
  scanTopLabel: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold, fontWeight: '800' },
  title: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 32,
    fontFamily: fonts.medium, fontWeight: '700',
    letterSpacing: -1.1,
  },
  cardLine: { marginTop: -spacing.x1, color: colors.muted, textAlign: 'left' },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.x4,
    gap: spacing.x2,
  },
  qrSection: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.x4,
  },
  qr: {
    padding: spacing.x4,
    borderRadius: radius.large,
    backgroundColor: colors.white,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 25,
    elevation: 6,
  },
  modeToggle: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.x4,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modeToggleCopy: { flex: 1, gap: 4 },
  modeToggleTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  modeToggleHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  tapPanel: {
    width: '100%',
    padding: spacing.x4,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.x2,
  },
  tapPanelActive: {
    borderColor: colors.accent,
    backgroundColor: '#eef8e8',
  },
  tapTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, fontWeight: '800', textAlign: 'center' },
  tapBody: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  tapMessage: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center' },
  helperInline: { marginTop: spacing.x3, color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center' },
  walletNote: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  actions: { gap: spacing.x2 },
  shareActionRow: { flexDirection: 'row', gap: spacing.x2 },
  walletConfirmRow: { flexDirection: 'row', gap: spacing.x2 },
  walletConfirmButton: { flex: 1 },
  sharePill: { flex: 1, alignSelf: 'stretch', height: 50 },
  sharePillText: { fontSize: 15, lineHeight: 19, fontFamily: fonts.semibold, fontWeight: '600' },
  actionButton: { alignSelf: 'stretch' },
  helper: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, textAlign: 'center' },
});
