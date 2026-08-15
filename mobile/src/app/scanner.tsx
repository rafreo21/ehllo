import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton, Body, Button, Eyebrow } from '@/components/ui';
import { ConnectionSuccessSheet } from '@/components/connection-success-sheet';
import { EmptyState } from '@/components/empty-state';
import { ScanShareSkeleton } from '@/components/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { connectionFromScannedSlug, type ScannedCardResult } from '@/features/connections/connections-api';
import { enqueueOfflineScan } from '@/features/connections/offline-scan-queue';
import { resolveCachedEventSnapshot } from '@/features/events/event-cache';
import { setAuthReturnPath } from '@/features/encounters/capture-draft';
import { isOnline } from '@/lib/connectivity';
import { describeError } from '@/lib/friendly-error';
import { parseEhlloCardSlugFromScan } from '@/lib/parse-scanned-qr';
import { useAppInsets } from '@/lib/safe-area';
import { colors, spacing } from '@/theme/tokens';

function parseCardSlug(url: string) {
  return parseEhlloCardSlugFromScan(url);
}

export default function ScannerScreen() {
  const { session } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');
  const [queuedMessage, setQueuedMessage] = useState('');
  const [scanResult, setScanResult] = useState<ScannedCardResult | null>(null);
  const insets = useAppInsets();

  async function openScannedCard(slug: string) {
    const normalized = slug.trim().toLowerCase();
    const eventSnapshot = await resolveCachedEventSnapshot();
    if (!session?.access_token) {
      await setAuthReturnPath(`/connections/scan/${encodeURIComponent(normalized)}`);
      router.replace('/auth');
      return;
    }

    if (!isOnline()) {
      await enqueueOfflineScan(normalized, eventSnapshot);
      setQueuedMessage(eventSnapshot
        ? `Saved at ${eventSnapshot.eventTitle}. This card will be added to your connections when you're back online.`
        : "You're offline. This card will be added to your connections automatically once you're back online.");
      setLocked(false);
      return;
    }

    setLinking(true);
    setError('');
    try {
      const result = await connectionFromScannedSlug(session.access_token, normalized, eventSnapshot);
      if (result) {
        setScanResult(result);
        setLinking(false);
        return;
      }
      setError('This card could not be added. Ask them to publish their card, then try again.');
      setLocked(false);
    } catch (caught) {
      if (!isOnline()) {
        await enqueueOfflineScan(normalized, eventSnapshot);
        setQueuedMessage(eventSnapshot
          ? `Saved at ${eventSnapshot.eventTitle}. This card will be added to your connections when you're back online.`
          : "You're offline. This card will be added to your connections automatically once you're back online.");
      } else {
        setError(describeError(caught, 'Could not open this card.'));
      }
      setLocked(false);
    } finally {
      setLinking(false);
    }
  }

  async function scanned(result: BarcodeScanningResult) {
    if (locked || linking) return;
    setLocked(true);
    setError('');
    setQueuedMessage('');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const slug = parseCardSlug(result.data);
    if (slug) {
      await openScannedCard(slug);
      return;
    }
    if (/^BEGIN:VCARD/i.test(result.data.trim())) {
      setError('This offline QR has no ehllo link. Save it in Contacts, or ask them to turn on Online contact QR for share-back.');
      setLocked(false);
      return;
    }
    if (await Linking.canOpenURL(result.data)) await Linking.openURL(result.data);
    else {
      setError('Could not read this QR code.');
      setLocked(false);
    }
  }

  if (!session) {
    return (
      <View style={[styles.previewSafe, { paddingTop: insets.top + spacing.x2 }]}>
        <ScrollView
          contentContainerStyle={[styles.previewContent, { paddingBottom: insets.bottom + spacing.x6 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.previewHeader}>
            <BackButton onPress={() => router.back()} />
            <View style={styles.headerCopy}>
              <Eyebrow>Scan</Eyebrow>
              <Text style={styles.previewTitle}>Add cards to your network</Text>
              <Body>Scan someone’s ehllo QR code to save their card and open their connection.</Body>
            </View>
          </View>
          <EmptyState
            illustration={require('@/assets/animations/scanner.json')}
            title="Sign in to scan cards"
            copy="Save cards you scan and keep everyone you meet in one place."
            primaryLabel="Sign in"
            onPrimary={() => router.push('/auth')}
          />
        </ScrollView>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={[styles.previewSafe, { paddingTop: insets.top + spacing.x2, paddingHorizontal: spacing.x5 }]}>
        <BackButton />
        <ScanShareSkeleton />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permission, { paddingTop: insets.top + spacing.x2, paddingBottom: insets.bottom + spacing.x5 }]}>
        <BackButton />
        <View style={styles.permissionContent}>
          <Text style={styles.permissionTitle}>Camera access is needed to scan a card.</Text>
          <Button onPress={async () => { await requestPermission(); }}>Allow camera</Button>
          <Button variant="ghost" onPress={() => router.back()}>Not now</Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={locked || linking ? undefined : scanned}
      />
      <View style={[styles.overlay, { paddingTop: insets.top + spacing.x3, paddingBottom: insets.bottom + spacing.x4 }]}>
        <BackButton style={styles.backOnDark} />
        <View style={styles.scanArea}>
          <View style={styles.frame}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
          </View>
        </View>
        {linking ? <ActivityIndicator color={colors.white} style={styles.spinner} /> : null}
        {!linking && !error && !queuedMessage ? (
          <Text style={styles.helper}>Adds ehllo cards to your network. Visitors should use their phone camera instead.</Text>
        ) : null}
        {error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
            <Button variant="ghost" onPress={() => { setLocked(false); setError(''); }}>Try again</Button>
          </View>
        ) : null}
        {queuedMessage ? (
          <View style={styles.queuedWrap}>
            <Text style={styles.queuedText}>{queuedMessage}</Text>
            <Button variant="ghost" onPress={() => { setLocked(false); setQueuedMessage(''); }}>Scan another</Button>
          </View>
        ) : null}
      </View>

      <ConnectionSuccessSheet
        visible={Boolean(scanResult)}
        personName={scanResult?.connection.name || ''}
        mutual={scanResult?.mutual ?? false}
        onClose={() => {
          setScanResult(null);
          if (router.canGoBack()) router.back();
          else router.replace('/connections');
        }}
        onViewCard={() => {
          const id = scanResult?.connection.id;
          setScanResult(null);
          if (id) router.replace(`/connections/${encodeURIComponent(id)}`);
        }}
        onAddFollowUp={() => {
          const connection = scanResult?.connection;
          setScanResult(null);
          if (!connection) return;
          router.replace({
            pathname: '/quick-follow-up',
            params: {
              personName: connection.name,
              personEmail: connection.email || '',
              sourceId: connection.sourceId,
            },
          });
        }}
      />
    </View>
  );
}

const corner = { position: 'absolute' as const, width: 38, height: 38, borderColor: colors.accent };
const styles = StyleSheet.create({
  previewSafe: { flex: 1, backgroundColor: colors.canvas },
  previewContent: { paddingHorizontal: spacing.x5, gap: spacing.x3, paddingTop: spacing.x2 },
  previewHeader: { gap: spacing.x3 },
  headerCopy: { gap: spacing.x2 },
  previewTitle: {
    color: colors.ink,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -1.1,
  },
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, paddingHorizontal: spacing.x5, backgroundColor: 'rgba(0,0,0,.28)' },
  backOnDark: { backgroundColor: colors.white, alignSelf: 'flex-start' },
  scanArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.x6,
  },
  frame: { width: 300, height: 300 },
  cornerTL: { ...corner, top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 12 },
  cornerTR: { ...corner, top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 12 },
  cornerBL: { ...corner, bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 12 },
  cornerBR: { ...corner, bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 12 },
  spinner: { marginTop: spacing.x3 },
  helper: {
    marginTop: spacing.x4,
    color: colors.white,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.92,
  },
  errorWrap: { marginTop: spacing.x4, gap: spacing.x2, alignItems: 'center' },
  errorText: { color: colors.white, textAlign: 'center', fontWeight: '600' },
  queuedWrap: { marginTop: spacing.x4, gap: spacing.x2, alignItems: 'center' },
  queuedText: { color: colors.white, textAlign: 'center', fontWeight: '600' },
  permission: { flex: 1, paddingHorizontal: spacing.x6, backgroundColor: colors.canvas },
  permissionContent: { flex: 1, justifyContent: 'center', gap: spacing.x4 },
  permissionTitle: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800' },
});
