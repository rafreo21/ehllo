import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { CaretRight, MagnifyingGlass, Plus, SortAscending } from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  ConnectionAddSheet,
  ConnectionManualAddSheet,
  ConnectionSortSheet,
} from '@/components/connection-sheets';
import { EmptyState } from '@/components/empty-state';
import { OfflineBanner } from '@/components/offline-banner';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { OutcomeSuccessSheet } from '@/components/outcome-success-sheet';
import {
  ConnectionsListSkeleton,
} from '@/components/skeleton';
import { BackButton, Body } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { connectionAvatarUrl } from '@/features/connections/connection-public-card';
import {
  connectionSourceLabel,
  createManualContact,
  enrichConnectionPhotos,
  fetchAllConnectionsMerged,
  filterConnections,
  sortConnections,
  type ConnectionItem,
  type ConnectionSort,
} from '@/features/connections/connections-api';
import { describeError } from '@/lib/friendly-error';
import { useAppInsets } from '@/lib/safe-area';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

function formatWhen(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ConnectionRow({ connection, onPress }: { connection: ConnectionItem; onPress: () => void }) {
  const avatar = connection.photoUrl || connectionAvatarUrl(connection);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Image source={avatar} style={styles.avatar} contentFit="cover" alt={`${connection.name} profile photo`} />
      <View style={styles.copy}>
        <Text style={styles.name} numberOfLines={1}>{connection.name}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{connection.subtitle}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.source}>{connectionSourceLabel(connection.source)}</Text>
          {connection.connectedAt ? <Text style={styles.when}>{formatWhen(connection.connectedAt)}</Text> : null}
        </View>
        {connection.eventTitle ? (
          <Text style={styles.eventMeta} numberOfLines={1}>
            At {connection.eventTitle}{connection.eventLocation ? ` · ${connection.eventLocation}` : ''}
          </Text>
        ) : null}
      </View>
      <CaretRight size={16} color={colors.muted} weight="bold" />
    </Pressable>
  );
}

export function ConnectionsScreen({ showBack = true }: { showBack?: boolean }) {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const insets = useAppInsets();
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [errorSheetOpen, setErrorSheetOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successSheetOpen, setSuccessSheetOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ConnectionSort>('date');
  const [addOpen, setAddOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [savingManual, setSavingManual] = useState(false);

  const showError = useCallback((message: string) => {
    setErrorMessage(message);
    setErrorSheetOpen(true);
  }, []);

  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    setSuccessSheetOpen(true);
  }, []);

  const load = useCallback(async (background = false) => {
    if (!accessToken) {
      setConnections([]);
      setLoading(false);
      setEnriching(false);
      return;
    }
    if (!background) setLoading(true);
    setErrorSheetOpen(false);
    setErrorMessage('');
    try {
      const merged = await fetchAllConnectionsMerged(accessToken);
      setConnections(merged);
      setLoading(false);
      setEnriching(true);
      void enrichConnectionPhotos(accessToken, merged)
        .then(setConnections)
        .finally(() => setEnriching(false));
    } catch (caught) {
      showError(describeError(caught, 'Could not load connections.'));
      setConnections([]);
      setLoading(false);
      setEnriching(false);
    }
  }, [accessToken, showError]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const interval = setInterval(() => void load(true), 30_000);
      return () => clearInterval(interval);
    }, [load]),
  );

  const visibleConnections = useMemo(
    () => sortConnections(filterConnections(connections, query), sort),
    [connections, query, sort],
  );

  async function saveManualContact(input: { name: string; email: string; role: string; company: string }) {
    if (!accessToken) {
      showError('Sign in to add connections.');
      return;
    }
    setSavingManual(true);
    try {
      await createManualContact(accessToken, input);
      setManualOpen(false);
      setAddOpen(false);
      showSuccess(`${input.name.trim()} was added to your connections.`);
      await load();
    } catch (caught) {
      showError(describeError(caught, 'Could not save this connection.'));
    } finally {
      setSavingManual(false);
    }
  }

  const hasConnections = connections.length > 0;

  return (
    <View style={[styles.safe, { paddingTop: insets.top + spacing.x2 }]}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            {showBack ? <BackButton onPress={() => router.back()} /> : <View />}
            {session ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add connection"
                onPress={() => setAddOpen(true)}
                style={styles.addButton}>
                <Plus size={22} color={colors.ink} weight="bold" />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.headerCopy}>
            <Text style={styles.title}>People you’ve met</Text>
            <Body>Cards you saved, and people who shared theirs.</Body>
          </View>

          {session && hasConnections ? (
            <View style={styles.searchRow}>
              <View style={styles.searchField}>
                <MagnifyingGlass size={18} color={colors.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search connections"
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sort connections"
                onPress={() => setSortOpen(true)}
                style={styles.sortButton}>
                <SortAscending size={20} color={colors.ink} weight="bold" />
              </Pressable>
            </View>
          ) : null}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.x6 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <OfflineBanner message="Offline. Showing your saved connections. New ones will sync once you're back online." />
          {!session ? (
            <EmptyState
              illustration={require('@/assets/animations/no-connections-yet.json')}
              title="Sign in to see connections"
              copy="Save cards you scan and people who share their details with you."
              primaryLabel="Sign in"
              onPrimary={() => router.push('/auth')}
            />
          ) : loading ? (
            <ConnectionsListSkeleton count={6} />
          ) : hasConnections ? (
            <View style={styles.list}>
              {enriching ? (
                <Text style={styles.enrichingCopy}>Updating photos…</Text>
              ) : null}
              {visibleConnections.map((connection) => (
                <ConnectionRow
                  key={connection.id}
                  connection={connection}
                  onPress={() => router.push(`/connections/${encodeURIComponent(connection.id)}`)}
                />
              ))}
              {!visibleConnections.length ? (
                <Body style={styles.emptySearch}>No connections match your search.</Body>
              ) : null}
            </View>
          ) : (
            <EmptyState
              illustration={require('@/assets/animations/no-connections-yet.json')}
              title="No connections yet"
              copy="Scan a card or add someone manually."
              onPress={() => setAddOpen(true)}
            />
          )}
        </ScrollView>
      </View>

      <ConnectionAddSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onAddManually={() => {
          setAddOpen(false);
          setManualOpen(true);
        }}
        onScanQr={() => {
          setAddOpen(false);
          router.push('/scanner');
        }}
      />

      <ConnectionManualAddSheet
        visible={manualOpen}
        saving={savingManual}
        onClose={() => setManualOpen(false)}
        onSave={(input) => void saveManualContact(input)}
      />

      <ConnectionSortSheet
        visible={sortOpen}
        sort={sort}
        onClose={() => setSortOpen(false)}
        onSelect={setSort}
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
        visible={successSheetOpen}
        message={successMessage}
        onClose={() => {
          setSuccessSheetOpen(false);
          setSuccessMessage('');
        }}
      />
    </View>
  );
}

export default ConnectionsScreen;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { flex: 1 },
  header: { gap: spacing.x3, paddingHorizontal: spacing.x5 },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  headerCopy: { gap: spacing.x2, marginBottom: spacing.x2 },
  title: {
    color: colors.ink,
    fontSize: 28,
    lineHeight: 30,
    fontFamily: fonts.medium, fontWeight: '700',
    letterSpacing: -1.1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
  },
  searchField: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: spacing.x3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: { flex: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: 15 },
  sortButton: {
    width: 46,
    height: 46,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  scroll: { flex: 1, marginTop: spacing.x2 },
  scrollContent: { paddingHorizontal: spacing.x5, gap: spacing.x3, paddingTop: spacing.x2 },
  list: { gap: spacing.x2 },
  enrichingCopy: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center', marginBottom: spacing.x1 },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x3,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
  },
  rowPressed: { opacity: 0.84 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceMuted,
  },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  name: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2, marginTop: 4 },
  source: { color: colors.inkSoft, fontSize: 10, fontFamily: fonts.medium, fontWeight: '700' },
  when: { color: colors.muted, fontFamily: fonts.regular, fontSize: 10 },
  eventMeta: { marginTop: 2, color: colors.inkSoft, fontSize: 11, fontFamily: fonts.medium, fontWeight: '700' },
  emptySearch: { textAlign: 'center', color: colors.muted },
});
