import { Code, ContactlessPayment, Copy, EnvelopeSimple, ImageSquare, LinkSimple, Monitor, SquaresFour, Watch } from 'phosphor-react-native';
import { Platform, Image, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';

import { BrandMark } from '@/components/brand-mark';
import { BrandedQrPreview } from '@/components/branded-qr-preview';
import { VirtualBackgroundPreviewBackground, WalletPreviewBackground } from '@/components/card-tool-preview-backgrounds';
import { AppleWalletButton } from '@/components/apple-wallet-button';
import { GoogleWalletButton } from '@/components/google-wallet-button';
import { Body, Button } from '@/components/ui';
import { showsCompanyDetails } from '@/features/card/company-display';
import type { themeSurfaceStyle } from '@/features/card/theme-colors';
import {
  copyNfcCardLink,
  copyNfcManufacturerPayload,
  isNativeNfcSupported,
  openNfcSettings,
} from '@/features/card/nfc-actions';
import {
  isTapToShareActive,
  isTapToShareNativeReady,
  isTapToShareSupported,
  startTapToShare,
  stopTapToShare,
  TAP_TO_SHARE_REBUILD_MESSAGE,
} from '@/features/card/nfc-hce-actions';
import {
  downloadShareAsset,
  virtualBackgroundInstructions,
  watchSetupInstructions,
} from '@/features/card/share-assets';
import { VirtualBackgroundPanelPreview } from '@/components/virtual-background-panel-preview';
import { updateQuickShareWidget, widgetSetupInstructions, buildWidgetSnapshot } from '@/features/card/widget-sync';
import { WIDGET_OPTIONS } from '@/features/card/widget-types';
import type { WidgetSnapshot } from '@/features/card/widget-types';
import {
  addAppleWalletPass,
  addGoogleWalletPass,
} from '@/features/card/wallet-actions';
import { readAppleWalletSaved } from '@/lib/apple-wallet-state';
import { readGoogleWalletSaved, writeGoogleWalletSaved } from '@/lib/google-wallet-state';
import type { MobileCard } from '@/features/card/types';
import type { SignatureProfile } from '@/lib/email-signature';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

export type CardToolTheme = ReturnType<typeof themeSurfaceStyle>;

type SheetActions = {
  busy: string;
  run: (
    action: string,
    task: () => Promise<void>,
    options?: { successMessage?: string },
  ) => Promise<void>;
};

type SharedSheetProps = {
  card: MobileCard;
  publicUrl: string;
  theme: CardToolTheme;
  actions: SheetActions;
  accessToken?: string;
  allCards?: MobileCard[];
  cardPublicUrl?: (card: MobileCard) => string;
};

export function WalletToolSheetContent({
  card,
  publicUrl,
  theme,
  actions,
  accessToken,
  walletAvailable,
  walletNote,
  showCompany,
}: SharedSheetProps & {
  walletAvailable: boolean | null;
  walletNote: string;
  showCompany: boolean;
}) {
  const { busy, run } = actions;
  const [googleWalletSaved, setGoogleWalletSaved] = useState(false);
  const [appleWalletSaved, setAppleWalletSaved] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !card.slug) return;
    void readGoogleWalletSaved(card.slug).then(setGoogleWalletSaved);
  }, [card.slug]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !card.slug) return;
    void readAppleWalletSaved(card.slug).then(setAppleWalletSaved);
  }, [card.slug]);

  return (
    <View style={styles.sheetBody}>
      <Body>
        {Platform.OS === 'ios'
          ? 'Your name, role, and a scannable link, ready for Apple Wallet.'
          : 'Your name, role, and a scannable link, ready for Google Wallet. While the issuer is in demo mode, passes may show a [TEST ONLY] prefix.'}
      </Body>
      {/* Photo first, then who they are, then the code - the order someone reads
          a person. The old layout led with three stacked NAME / JOB TITLE /
          COMPANY labels, which spent the top third of the card naming its own
          fields instead of showing the person, and pushed the photo out
          entirely. Field labels belong on a Wallet pass, where the OS draws
          them; they do not belong on a preview we lay out ourselves. */}
      <WalletPreviewBackground theme={card.theme} style={styles.walletPreview}>
        <View style={styles.walletBrandBar}>
          <BrandMark size={26} />
          <Text style={[styles.walletBrand, { color: theme.color }]}>ehllo</Text>
        </View>

        {card.photo?.trim() ? (
          <Image source={{ uri: card.photo.trim() }} style={styles.walletPhoto} resizeMode="cover" />
        ) : (
          <View style={[styles.walletPhoto, styles.walletPhotoEmpty]}>
            <ImageSquare size={26} color={colors.muted} weight="bold" />
            <Text style={styles.walletPhotoEmptyText}>Add a photo to your card</Text>
          </View>
        )}

        <View style={styles.walletBody}>
          <Text style={[styles.walletName, { color: theme.color }]} numberOfLines={1}>
            {card.name || 'Your name'}
          </Text>
          {card.role || (showCompany && card.company) ? (
            <Text style={[styles.walletRole, { color: theme.mutedColor }]} numberOfLines={1}>
              {[card.role, showCompany ? card.company : ''].filter(Boolean).join(' · ')}
            </Text>
          ) : null}

          <View style={styles.walletQrTile}>
            <BrandedQrPreview card={card} cardUrl={publicUrl} size={136} />
            <Text style={styles.walletQrCaption}>Scan to connect</Text>
          </View>
        </View>
      </WalletPreviewBackground>
      {Platform.OS === 'ios' ? (
        <>
          <AppleWalletButton
            loading={busy === 'apple'}
            disabled={walletAvailable === false}
            mode={appleWalletSaved ? 'view' : 'add'}
            onPress={() => void run('apple', async () => {
              if (!accessToken) throw new Error('Sign in required.');
              await addAppleWalletPass(card.slug, accessToken);
              // Deliberately does not record the pass as saved. addAppleWalletPass
              // resolves when iOS shows its sheet, not when someone taps Add, so
              // writing the flag here marked a cancelled add as saved - and the flag
              // is what turns the button into "View in Apple Wallet" with no way
              // back. The share-card screen asks before recording it; this sheet has
              // nowhere to ask, so it claims nothing.
            }, { successMessage: 'Choose Add to Wallet from the share sheet.' })}
          />
          {walletAvailable === false && walletNote ? (
            <Text style={styles.note}>{walletNote} Ask your admin to add Apple Wallet signing keys on the server.</Text>
          ) : null}
        </>
      ) : null}
      {Platform.OS === 'android' ? (
        <>
          <GoogleWalletButton
            loading={busy === 'google'}
            disabled={walletAvailable === false}
            mode={googleWalletSaved ? 'view' : 'add'}
            onPress={() => void run('google', async () => {
              if (!accessToken) throw new Error('Sign in required.');
              await addGoogleWalletPass(card.slug, accessToken);
              void writeGoogleWalletSaved(card.slug, true);
              setGoogleWalletSaved(true);
            }, { successMessage: 'Finish adding the pass in Google Wallet.' })}
          />
          {walletAvailable === false && walletNote ? (
            <Text style={styles.note}>{walletNote} Ask your admin to add GOOGLE_WALLET_ISSUER_ID and GOOGLE_WALLET_SERVICE_ACCOUNT_JSON on Vercel.</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function NfcToolSheetContent({
  card,
  publicUrl,
  actions,
}: Pick<SharedSheetProps, 'card' | 'publicUrl' | 'actions'>) {
  const { busy, run } = actions;
  const [tapActive, setTapActive] = useState(isTapToShareActive());
  const tapNativeReady = isTapToShareNativeReady();

  return (
    <View style={styles.sheetBody}>
      <Body>Tap phones together on Android, program a sticker, or copy the link for manufacturer tools.</Body>
      {!tapNativeReady ? (
        <Text style={styles.note}>{TAP_TO_SHARE_REBUILD_MESSAGE}</Text>
      ) : null}
      <View style={styles.nfcQrPreview}>
        <BrandedQrPreview card={card} cardUrl={publicUrl} size={132} />
        <Text style={styles.note}>Opens your live card page so visitors can save your details and share theirs back.</Text>
      </View>
      {isTapToShareSupported() ? (
        <Button
          variant={tapActive ? 'secondary' : 'primary'}
          loading={busy === 'nfc-tap'}
          disabled={!publicUrl}
          onPress={() => void run('nfc-tap', async () => {
            if (tapActive || isTapToShareActive()) {
              await stopTapToShare();
              setTapActive(false);
              return;
            }
            await startTapToShare(publicUrl);
            setTapActive(true);
          }, {
            successMessage: tapActive
              ? 'Tap to share turned off.'
              : 'Ready. Ask them to tap your phone.',
          })}>
          <ContactlessPayment size={18} color={tapActive ? colors.ink : colors.white} weight="bold" />
          {tapActive ? 'Stop tap to share' : 'Tap to share'}
        </Button>
      ) : null}
      {isNativeNfcSupported() ? (
        <>
          <Button
            disabled={!publicUrl}
            onPress={() => router.push(`/program-nfc?id=${card.id}`)}>
            <ContactlessPayment size={18} color={colors.white} weight="bold" />
            Program NFC tag
          </Button>
          <Button variant="secondary" onPress={() => void openNfcSettings()}>
            Open NFC settings
          </Button>
        </>
      ) : (
        <Text style={styles.note}>Open ehllo on a supported iPhone or Android phone to program a writable NFC tag.</Text>
      )}
      <Button
        variant="secondary"
        loading={busy === 'nfc-link'}
        onPress={() => void run('nfc-link', async () => {
          await copyNfcCardLink(publicUrl);
        }, { successMessage: 'Card link copied. Paste it into your NFC tool.' })}>
        <LinkSimple size={16} color={colors.ink} weight="bold" />
        Copy card link for NFC
      </Button>
      <Button
        variant="ghost"
        loading={busy === 'nfc-copy'}
        onPress={() => void run('nfc-copy', async () => {
          await copyNfcManufacturerPayload(card, publicUrl);
        }, { successMessage: 'Programming JSON copied for manufacturer tools.' })}>
        <Copy size={16} color={colors.ink} weight="bold" />
        Copy NFC programming JSON
      </Button>
    </View>
  );
}

export function WidgetToolSheetContent({
  card,
  publicUrl,
  theme,
  actions,
  accessToken,
  allCards = [card],
  cardPublicUrl,
  showCompany,
  initials,
}: SharedSheetProps & {
  showCompany: boolean;
  initials: string;
}) {
  const { busy, run } = actions;
  const [snapshot, setSnapshot] = useState<WidgetSnapshot | null>(null);
  const resolveCardUrl = useMemo(
    () => cardPublicUrl || (() => publicUrl),
    [cardPublicUrl, publicUrl],
  );

  useEffect(() => {
    let cancelled = false;
    void buildWidgetSnapshot(allCards, resolveCardUrl, accessToken, card).then((next) => {
      if (!cancelled) setSnapshot(next);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, allCards, card, publicUrl, resolveCardUrl]);

  const connections = snapshot?.connections ?? [];
  const firstConnection = connections[0];
  const cardCount = snapshot?.cards.length ?? 0;

  return (
    <View style={styles.sheetBody}>
      <Body>{widgetSetupInstructions(Platform.OS === 'android' ? 'android' : 'ios')}</Body>
      <Body style={styles.note}>
        Widgets sync all published cards. Use ‹ › on the Business Card widget to switch cards.
        {cardCount > 1 ? ` ${cardCount} cards ready.` : ''}
      </Body>
      <View style={styles.widgetGallery}>
        {WIDGET_OPTIONS.map((option) => {
          if (option.id === 'qr-scan') {
            return (
              <View key={option.id} style={styles.widgetOptionCard}>
                <View style={styles.widgetOptionHeader}>
                  <Text style={styles.widgetOptionBrand}>ehllo</Text>
                  <Text style={styles.widgetOptionSize}>{option.size}</Text>
                </View>
                <View style={styles.widgetQrOnlyPreview}>
                  <View style={[styles.widgetQrOnlyFrame, { borderColor: theme.backgroundColor }]}>
                    <BrandedQrPreview
                      card={card}
                      cardUrl={publicUrl}
                      size={90}
                    />
                  </View>
                </View>
                <Text style={styles.widgetOptionTitle}>{option.title}</Text>
                <Text style={styles.widgetOptionCopy}>{option.description}</Text>
              </View>
            );
          }

          if (option.id === 'business-card') {
            return (
              <View key={option.id} style={styles.widgetOptionCard}>
                <View style={styles.widgetOptionHeader}>
                  <Text style={styles.widgetOptionBrand}>ehllo</Text>
                  <Text style={styles.widgetOptionSize}>{option.size}</Text>
                </View>
                <View style={styles.widgetBusinessPreview}>
                  <View style={styles.widgetBusinessQr}>
                    <BrandedQrPreview
                      card={card}
                      cardUrl={publicUrl}
                      size={68}
                    />
                  </View>
                  <View style={styles.widgetBusinessCopy}>
                    {card.photo?.trim() ? (
                      <Image source={{ uri: card.photo }} style={styles.widgetPhotoSmall} alt={`${card.name || 'Your'} profile photo`} />
                    ) : (
                      <View style={styles.widgetAvatarSmall}>
                        <Text style={styles.widgetAvatarText}>{initials}</Text>
                      </View>
                    )}
                    <Text style={styles.widgetNameLight}>{card.name}</Text>
                    {card.role ? <Text style={styles.widgetRoleLight}>{card.role}</Text> : null}
                    {showCompany && card.company ? <Text style={styles.widgetCompanyLight}>{card.company}</Text> : null}
                  </View>
                </View>
                <Text style={styles.widgetOptionTitle}>{option.title}</Text>
                <Text style={styles.widgetOptionCopy}>{option.description}</Text>
              </View>
            );
          }

          return (
            <View key={option.id} style={styles.widgetOptionCard}>
              <View style={styles.widgetOptionHeader}>
                <Text style={styles.widgetOptionBrand}>ehllo</Text>
                <Text style={styles.widgetOptionSize}>{option.size}</Text>
              </View>
              <View style={styles.widgetConnectionsPreview}>
                <Text style={[styles.widgetConnectionsEyebrow, { color: theme.backgroundColor }]}>Recent connections</Text>
                {firstConnection ? (
                  <View style={styles.widgetConnectionRow}>
                    <View style={styles.widgetAvatarSmall}>
                      <Text style={styles.widgetAvatarText}>
                        {firstConnection.name.trim().charAt(0).toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View style={styles.widgetConnectionCopy}>
                      <Text style={styles.widgetNameLight}>{firstConnection.name}</Text>
                      <Text style={styles.widgetRoleLight}>
                        {firstConnection.subtitle || 'Shared via your card'}
                      </Text>
                    </View>
                    <Text style={styles.widgetActionChip}>☎</Text>
                    <Text style={styles.widgetActionChip}>✉</Text>
                  </View>
                ) : (
                  <Text style={styles.widgetConnectionsEmpty}>Share your card to see new connections here.</Text>
                )}
              </View>
              <Text style={styles.widgetOptionTitle}>{option.title}</Text>
              <Text style={styles.widgetOptionCopy}>{option.description}</Text>
            </View>
          );
        })}
      </View>
      <Button
        loading={busy === 'widget'}
        onPress={() => void run('widget', async () => {
          await updateQuickShareWidget(card, publicUrl, accessToken, allCards, resolveCardUrl);
          const next = await buildWidgetSnapshot(allCards, resolveCardUrl, accessToken, card);
          setSnapshot(next);
        }, { successMessage: 'Widget data refreshed. Add or update ehllo from your widget picker.' })}>
        <SquaresFour size={18} color={colors.ink} weight="bold" />
        Refresh home-screen widgets
      </Button>
    </View>
  );
}

export function SignatureToolSheetContent({
  card,
  publicUrl,
  signatureProfile,
  initials,
  showCompany,
  copied,
  copySignature,
}: {
  card: MobileCard;
  publicUrl: string;
  signatureProfile: SignatureProfile;
  initials: string;
  showCompany: boolean;
  copied: string;
  copySignature: (kind: 'plain' | 'html') => Promise<void>;
}) {
  return (
    <View style={styles.sheetBody}>
      <Body>Paste the HTML version into Gmail, Outlook, or Apple Mail signature settings.</Body>
      <View style={styles.signaturePreview}>
        {signatureProfile.photoUrl?.trim() ? (
          <Image
            source={{ uri: signatureProfile.photoUrl.trim() }}
            style={styles.signaturePhotoImage}
            accessibilityLabel={`${card.name || 'Your'} profile photo`}
            alt={`${card.name || 'Your'} profile photo`}
          />
        ) : (
          <View style={styles.signaturePhoto}>
            <Text style={styles.signaturePhotoText}>{initials}</Text>
          </View>
        )}
        <View style={styles.signatureBody}>
          <Text style={styles.signatureName}>{card.name || 'Your name'}</Text>
          {card.role ? <Text style={styles.signatureLine}>{card.role}</Text> : null}
          {showCompany && card.company ? <Text style={styles.signatureLine}>{card.company}</Text> : null}
          {signatureProfile.phone ? <Text style={styles.signatureContact}>☎ {signatureProfile.phone}</Text> : null}
          {signatureProfile.email ? <Text style={styles.signatureContact}>✉ {signatureProfile.email}</Text> : null}
          <Text style={styles.signatureLink}>View my card</Text>
        </View>
        <View style={styles.signatureQr}>
          <BrandedQrPreview card={card} cardUrl={publicUrl} size={72} />
        </View>
      </View>
      <Button variant="secondary" onPress={() => void copySignature('plain')}>
        <EnvelopeSimple size={18} color={colors.ink} weight="bold" />
        {copied === 'plain' ? 'Plain copied' : 'Copy plain signature'}
      </Button>
      <Button variant="ghost" onPress={() => void copySignature('html')}>
        <Code size={16} color={colors.ink} weight="bold" />
        {copied === 'html' ? 'HTML copied' : 'Copy HTML signature'}
      </Button>
    </View>
  );
}

export function WatchToolSheetContent({
  card,
  publicUrl,
  actions,
  accessToken,
  published,
}: SharedSheetProps & { published: boolean }) {
  const { busy, run } = actions;

  return (
    <View style={styles.sheetBody}>
      <Body>{watchSetupInstructions(Platform.OS === 'android' ? 'android' : 'ios')}</Body>
      <View style={styles.watchPreview}>
        <Text style={styles.watchLabel}>Personal card</Text>
        <View style={styles.watchQr}>
          <BrandedQrPreview card={card} cardUrl={publicUrl} size={120} />
        </View>
      </View>
      <Button
        loading={busy === 'watch'}
        disabled={!accessToken || !published}
        onPress={() => void run('watch', async () => {
          if (!accessToken) throw new Error('Sign in required.');
          await downloadShareAsset(card.slug, 'watch-face', accessToken);
        }, { successMessage: 'Watch QR downloaded. Add it to your watch face.' })}>
        <Watch size={18} color={colors.ink} weight="bold" />
        Download watch QR
      </Button>
    </View>
  );
}

export function BackgroundToolSheetContent({
  card,
  publicUrl,
  actions,
  accessToken,
  published,
}: SharedSheetProps & { published: boolean; subtitle: string }) {
  const { busy, run } = actions;

  return (
    <View style={styles.sheetBody}>
      <Body>{virtualBackgroundInstructions()}</Body>
      <VirtualBackgroundPreviewBackground theme={card.theme} style={styles.backgroundPreview}>
        <VirtualBackgroundPanelPreview
          card={card}
          cardUrl={publicUrl}
          panelWidth={200}
        />
      </VirtualBackgroundPreviewBackground>
      <Button
        loading={busy === 'background'}
        disabled={!accessToken || !published}
        onPress={() => void run('background', async () => {
          if (!accessToken) throw new Error('Sign in required.');
          await downloadShareAsset(card.slug, 'virtual-background', accessToken, { themeColor: card.theme });
        }, { successMessage: 'Virtual background downloaded. Import it in your meeting app.' })}>
        <Monitor size={18} color={colors.ink} weight="bold" />
        Download virtual background
      </Button>
    </View>
  );
}

export function cardToolInitials(card: MobileCard) {
  return card.name.trim().split(/\s+/).map((part) => part[0] || '').join('').slice(0, 2).toUpperCase() || 'AM';
}

export function cardToolShowCompany(card: MobileCard) {
  return showsCompanyDetails(card);
}

const styles = StyleSheet.create({
  sheetBody: { gap: spacing.x3 },
  note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  // No padding on the frame: the photo has to reach the rounded edges, so each
  // band pads itself instead.
  walletPreview: {
    padding: 0,
    overflow: 'hidden',
  },
  walletBrandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    paddingHorizontal: spacing.x4,
    paddingVertical: spacing.x3,
  },
  walletPhoto: { width: '100%', aspectRatio: 4 / 3 },
  walletPhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x2,
    backgroundColor: colors.surfaceMuted,
  },
  walletPhotoEmptyText: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular },
  walletBody: { paddingHorizontal: spacing.x4, paddingTop: spacing.x4, paddingBottom: spacing.x5, gap: 2 },
  walletBrand: { fontSize: 17, fontFamily: fonts.bold, fontWeight: '800' },
  walletName: { fontSize: 22, fontFamily: fonts.bold, fontWeight: '800', letterSpacing: -0.4 },
  walletRole: { fontSize: 14, fontFamily: fonts.regular, marginTop: 2 },
  walletQrTile: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.x2,
    marginTop: spacing.x5,
    padding: spacing.x3,
    borderRadius: radius.medium,
    backgroundColor: colors.white,
  },
  walletQrCaption: { color: colors.ink, fontSize: 13, fontFamily: fonts.medium, fontWeight: '700' },
  nfcQrPreview: {
    alignItems: 'center',
    gap: spacing.x2,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.white,
  },
  signaturePreview: {
    flexDirection: 'row',
    borderRadius: radius.medium,
    padding: spacing.x4,
    gap: spacing.x4,
    backgroundColor: colors.white,
  },
  signaturePhoto: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signaturePhotoImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  signaturePhotoText: { color: colors.white, fontSize: 20, fontFamily: fonts.bold, fontWeight: '800' },
  signatureBody: { flex: 1, gap: 2 },
  signatureQr: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    overflow: 'hidden',
  },
  signatureName: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, fontWeight: '800' },
  signatureLine: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  signatureContact: { color: colors.ink, fontFamily: fonts.regular, fontSize: 13, marginTop: 4 },
  signatureLink: { color: '#2F5711', fontSize: 12, fontFamily: fonts.bold, fontWeight: '800', marginTop: 8 },
  widgetQrLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.bold, fontWeight: '800' },
  widgetAvatarText: { color: colors.white, fontSize: 11, fontFamily: fonts.bold, fontWeight: '800' },
  widgetGallery: { gap: spacing.x3 },
  widgetOptionCard: {
    borderRadius: radius.medium,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.x4,
    gap: spacing.x3,
  },
  widgetOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  widgetOptionBrand: { color: colors.muted, fontSize: 11, fontFamily: fonts.bold, fontWeight: '800' },
  widgetOptionSize: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, fontWeight: '700' },
  widgetOptionTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  widgetOptionCopy: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  widgetQrOnlyPreview: {
    borderRadius: 18,
    backgroundColor: '#141814',
    padding: spacing.x4,
    alignItems: 'center',
  },
  widgetQrOnlyFrame: {
    width: 96,
    height: 96,
    borderRadius: 16,
    borderWidth: 3,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  widgetBusinessPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    borderRadius: 18,
    backgroundColor: '#141814',
    padding: spacing.x4,
  },
  widgetBusinessQr: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  widgetPhotoSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  widgetBusinessCopy: { flex: 1, gap: 2 },
  widgetConnectionsPreview: {
    borderRadius: 18,
    backgroundColor: '#141814',
    padding: spacing.x4,
    gap: spacing.x3,
  },
  widgetConnectionsEyebrow: { fontSize: 10, fontFamily: fonts.bold, fontWeight: '800' },
  widgetConnectionsEmpty: { color: '#B8C4B3', fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  widgetConnectionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  widgetConnectionCopy: { flex: 1, gap: 1 },
  widgetActionChip: { fontFamily: fonts.regular,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#243024',
    color: colors.white,
    textAlign: 'center',
    lineHeight: 28,
    overflow: 'hidden', },
  widgetAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#243024',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  widgetNameLight: { color: colors.white, fontSize: 13, fontFamily: fonts.bold, fontWeight: '800' },
  widgetRoleLight: { color: '#B8C4B3', fontFamily: fonts.regular, fontSize: 10 },
  widgetCompanyLight: { color: '#8FA088', fontFamily: fonts.regular, fontSize: 10 },
  widgetQrLabelLight: { color: colors.white, fontSize: 11, fontFamily: fonts.bold, fontWeight: '800' },
  watchPreview: {
    alignItems: 'center',
    padding: spacing.x4,
    borderRadius: 28,
    backgroundColor: '#050505',
    gap: spacing.x3,
  },
  watchLabel: { color: colors.white, fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600' },
  watchQr: {
    width: 120,
    height: 120,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundPreview: {
    width: '100%',
  },
});
