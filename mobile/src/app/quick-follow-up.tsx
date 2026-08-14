import { router, useLocalSearchParams } from 'expo-router';
import {
  CaretDown,
  CaretRight,
  CaretUp,
  CheckCircle,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  QrCode,
  Scan,
  Trash,
  X,
} from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { BrandedQrCode } from '@/components/branded-qr-code';
import { FollowUpDuePicker } from '@/components/follow-up-due-picker';
import { Body, Button, PageHeader } from '@/components/ui';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { OutcomeSuccessSheet } from '@/components/outcome-success-sheet';
import { useAuth } from '@/features/auth/auth-context';
import { useCard } from '@/features/card/card-context';
import { fetchAllConnectionsMerged, filterConnections, type ConnectionItem } from '@/features/connections/connections-api';
import { buildEncounterPayload, fetchInboundExchanges, saveEncounter, type InboundExchange } from '@/features/encounters/encounter-api';
import { displayFollowUpTitle, SELECTABLE_FOLLOW_UP_CHANNELS, type FollowUpChannel } from '@/features/follow-ups/follow-up-channels';
import { clearQuickFollowUpDraft, readQuickFollowUpDraft, writeQuickFollowUpDraft } from '@/features/follow-ups/quick-follow-up-draft';
import { enqueueQuickFollowUp } from '@/features/follow-ups/quick-follow-up-queue';
import { resolveCachedEventSnapshot, type EventSnapshot } from '@/features/events/event-cache';
import type { QuickFollowUpItem } from '@/features/follow-ups/quick-follow-up-types';
import { formatDueLabel } from '@/lib/due-date';
import { isOnline } from '@/lib/connectivity';
import { useAppInsets } from '@/lib/safe-area';
import { colors, radius, spacing } from '@/theme/tokens';

type QuickFollowUpDraft = QuickFollowUpItem;

export default function QuickFollowUpScreen() {
  const params = useLocalSearchParams<{
    personName?: string;
    personEmail?: string;
    sourceId?: string;
    contactId?: string;
    exchangeId?: string;
  }>();
  const { session } = useAuth();
  const { card, publicUrl } = useCard();
  const insets = useAppInsets();

  const [personName, setPersonName] = useState(params.personName?.trim() || '');
  const [personEmail, setPersonEmail] = useState(params.personEmail?.trim() || '');

  const [addPersonSheetOpen, setAddPersonSheetOpen] = useState(false);
  const [personSearchQuery, setPersonSearchQuery] = useState('');
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [scansOpen, setScansOpen] = useState(false);
  const [exchanges, setExchanges] = useState<InboundExchange[]>([]);
  const [loadingExchanges, setLoadingExchanges] = useState(false);

  const [followUps, setFollowUps] = useState<QuickFollowUpDraft[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingFollowUpId, setEditingFollowUpId] = useState('');
  const [followUpDetailOpen, setFollowUpDetailOpen] = useState<Record<string, boolean>>({});

  const [draftTitle, setDraftTitle] = useState('');
  const [draftChannel, setDraftChannel] = useState<FollowUpChannel>('email');
  const [draftOwner, setDraftOwner] = useState<'me' | 'guest'>('me');
  const [draftDueAt, setDraftDueAt] = useState('');
  const [draftDetailOpen, setDraftDetailOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [outcomeError, setOutcomeError] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [eventContext, setEventContext] = useState<EventSnapshot | undefined>();

  useEffect(() => {
    void resolveCachedEventSnapshot().then(setEventContext);
  }, []);

  // Resume an in-progress Quick Follow-up if the app was backgrounded or
  // closed before it was saved. Only when there's no explicit navigation
  // target (from a connection's detail page) or the draft matches it — a
  // stale draft for a different person should never silently take over.
  useEffect(() => {
    (async () => {
      const draft = await readQuickFollowUpDraft();
      const targetName = params.personName?.trim().toLowerCase();
      const draftMatchesTarget = !targetName || draft?.personName.trim().toLowerCase() === targetName;
      if (draft && draftMatchesTarget) {
        if (draft.personName) setPersonName(draft.personName);
        if (draft.personEmail) setPersonEmail(draft.personEmail);
        if (draft.followUps.length) setFollowUps(draft.followUps);
      }
      setDraftHydrated(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume is a one-time mount effect
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    if (!personName.trim() && !followUps.length) {
      void clearQuickFollowUpDraft();
      return;
    }
    void writeQuickFollowUpDraft({
      personName,
      personEmail,
      sourceId: params.sourceId,
      contactId: params.contactId,
      exchangeId: params.exchangeId,
      followUps,
      updatedAt: new Date().toISOString(),
    });
  }, [draftHydrated, personName, personEmail, followUps, params.sourceId, params.contactId, params.exchangeId]);

  useEffect(() => {
    if (!addPersonSheetOpen || !session?.access_token) return;
    void fetchAllConnectionsMerged(session.access_token).then(setConnections).catch(() => setConnections([]));
  }, [addPersonSheetOpen, session?.access_token]);

  function pickConnection(connection: ConnectionItem) {
    setPersonName(connection.name);
    setPersonEmail(connection.email || '');
    setAddPersonSheetOpen(false);
    setPersonSearchQuery('');
  }

  function saveManualPerson() {
    const cleanName = manualName.trim();
    if (cleanName.length < 2) {
      setValidationError('Enter a name.');
      return;
    }
    setPersonName(cleanName);
    setPersonEmail(manualEmail.trim());
    setValidationError('');
    setManualOpen(false);
    setAddPersonSheetOpen(false);
  }

  async function openScans() {
    setScansOpen(true);
    if (!session?.access_token || exchanges.length) return;
    setLoadingExchanges(true);
    try {
      setExchanges(await fetchInboundExchanges(session.access_token));
    } catch {
      setExchanges([]);
    } finally {
      setLoadingExchanges(false);
    }
  }

  function pickExchange(exchange: InboundExchange) {
    setPersonName(exchange.visitor_name || 'Unknown visitor');
    setPersonEmail(exchange.visitor_email || '');
    setScansOpen(false);
    setAddPersonSheetOpen(false);
  }

  function addFollowUp() {
    setFollowUps((current) => [...current, {
      id: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: draftTitle.trim(),
      channel: draftChannel,
      owner: draftOwner,
      dueAt: draftDueAt,
    }]);
    setDraftTitle('');
    setDraftChannel('email');
    setDraftOwner('me');
    setDraftDueAt('');
    setDraftDetailOpen(false);
    setComposerOpen(false);
  }

  function updateFollowUp(id: string, patch: Partial<QuickFollowUpDraft>) {
    setFollowUps((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeFollowUp(id: string) {
    setFollowUps((current) => current.filter((item) => item.id !== id));
  }

  const searchResults = personSearchQuery.trim() ? filterConnections(connections, personSearchQuery) : [];
  const editingItem = followUps.find((item) => item.id === editingFollowUpId) || null;
  const editingPronoun = editingItem?.owner === 'guest' ? 'they' : 'you';

  async function queueForLater(cleanName: string) {
    const occurredAt = new Date();
    await enqueueQuickFollowUp({
      personName: cleanName,
      personEmail: personEmail.trim(),
      sourceId: params.sourceId,
      contactId: params.contactId,
      exchangeId: params.exchangeId,
      followUps,
      eventSnapshot: await resolveCachedEventSnapshot(occurredAt),
    });
    await clearQuickFollowUpDraft();
    setSaving(false);
    setQueuedOffline(true);
    setNewGuestName('');
    setSuccessOpen(true);
  }

  async function submit() {
    const cleanName = personName.trim();
    if (!session?.access_token) {
      setOutcomeError('Sign in before adding a follow-up.');
      return;
    }
    if (cleanName.length < 2) {
      setValidationError('Add the person this follow-up is for.');
      return;
    }
    if (!followUps.length) {
      setValidationError('Add at least one follow-up.');
      return;
    }

    setSaving(true);
    setValidationError('');
    setOutcomeError('');

    if (!isOnline()) {
      await queueForLater(cleanName);
      return;
    }

    try {
      const occurredAt = new Date();
      const eventSnapshot = await resolveCachedEventSnapshot(occurredAt);
      const encounter = buildEncounterPayload({
        transcript: '',
        title: `Follow-up with ${cleanName}`,
        personName: cleanName,
        personEmail: personEmail.trim(),
        people: [{
          id: params.sourceId || undefined,
          name: cleanName,
          email: personEmail.trim(),
          exchangeId: params.exchangeId || undefined,
        }],
        contactId: params.contactId || undefined,
        exchangeId: params.exchangeId || undefined,
        sharedSummary: '',
        privateNotes: '',
        manualFollowUps: followUps.map((item) => ({
          title: item.title,
          channel: item.channel,
          owner: item.owner,
          targetPersonId: '',
          dueAt: item.dueAt,
        })),
        consentConfirmed: false,
        status: 'reviewed',
        durationSeconds: 0,
        startedAt: occurredAt.toISOString(),
        eventId: eventSnapshot?.eventId,
      });
      const result = await saveEncounter(session.access_token, encounter);
      await clearQuickFollowUpDraft();
      setSaving(false);
      setQueuedOffline(false);
      setNewGuestName(result.newGuestNames[0] || '');
      setSuccessOpen(true);
    } catch (caught) {
      if (!isOnline()) {
        await queueForLater(cleanName);
        return;
      }
      setOutcomeError(caught instanceof Error ? caught.message : 'Could not add this follow-up.');
      setSaving(false);
    }
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top + spacing.x2 }]}>
      <View style={styles.header}>
        <PageHeader
          eyebrow="Quick follow-up"
          title="What needs to happen next?"
          onBack={() => router.back()}
        />
        <Body>Create a reminder without recording a conversation. Nothing is sent automatically.</Body>
        {eventContext ? (
          <Text style={styles.eventContext}>
            At {eventContext.eventTitle}{eventContext.eventLocation ? ` · ${eventContext.eventLocation}` : ''}
          </Text>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {validationError ? <Text style={styles.error}>{validationError}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => setAddPersonSheetOpen(true)}
          style={styles.personTrigger}>
          <View style={styles.personTriggerCopy}>
            <Text style={styles.label}>Person</Text>
            {personName.trim() ? (
              <>
                <Text style={styles.personTriggerName}>{personName}</Text>
                {personEmail.trim() ? <Text style={styles.linkHint}>{personEmail}</Text> : null}
              </>
            ) : (
              <Text style={styles.linkHint}>Who is this follow-up for?</Text>
            )}
          </View>
          {personName.trim() ? (
            <PencilSimple size={18} color={colors.ink} weight="bold" />
          ) : (
            <Plus size={18} color={colors.ink} weight="bold" />
          )}
        </Pressable>

        {followUps.length ? (
          <View style={styles.actionList}>
            {followUps.map((item) => {
              const channelLabel = SELECTABLE_FOLLOW_UP_CHANNELS.find((entry) => entry.id === item.channel)?.label || item.channel;
              const ownerLabel = item.owner === 'me'
                ? (personName.trim() ? `You → ${personName.trim()}` : 'You')
                : (personName.trim() || 'Them');
              const dueLabel = formatDueLabel(item.dueAt);
              return (
                <View key={item.id} style={styles.actionItem}>
                  <View style={styles.actionRow}>
                    <View style={styles.actionCopy}>
                      <Text style={styles.actionTitle}>{displayFollowUpTitle(item.title, item.channel)}</Text>
                      <Text style={styles.linkHint}>{ownerLabel} · {channelLabel}{dueLabel ? ` · ${dueLabel}` : ''}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${displayFollowUpTitle(item.title, item.channel)}`}
                      onPress={() => setEditingFollowUpId(item.id)}
                      hitSlop={8}>
                      <PencilSimple size={19} color={colors.ink} weight="bold" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${displayFollowUpTitle(item.title, item.channel)}`}
                      onPress={() => removeFollowUp(item.id)}
                      hitSlop={8}>
                      <Trash size={19} color={colors.muted} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => setComposerOpen(true)}
          style={styles.actionComposerToggle}>
          <View style={styles.actionComposerToggleCopy}>
            <Plus size={17} color={colors.ink} weight="bold" />
            <Text style={styles.actionComposerToggleText}>
              {followUps.length ? 'Add another follow-up' : 'Add a follow-up'}
            </Text>
          </View>
        </Pressable>

        <BottomSheet
          visible={composerOpen}
          title="Add a follow-up"
          onClose={() => setComposerOpen(false)}
          footer={
            <Button onPress={addFollowUp}>
              <Plus size={18} color={colors.ink} weight="bold" />
              Add follow-up
            </Button>
          }>
          {(() => {
            const draftPronoun = draftOwner === 'me' ? 'you' : 'they';
            return (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Owner</Text>
                  <View style={styles.chips}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: draftOwner === 'me' }}
                      onPress={() => setDraftOwner('me')}
                      style={[styles.chip, draftOwner === 'me' && styles.chipActive]}>
                      <Text style={[styles.chipText, draftOwner === 'me' && styles.chipTextActive]}>You</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: draftOwner === 'guest' }}
                      onPress={() => setDraftOwner('guest')}
                      style={[styles.chip, draftOwner === 'guest' && styles.chipActive]}>
                      <Text style={[styles.chipText, draftOwner === 'guest' && styles.chipTextActive]}>
                        {personName.trim() || 'Them'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>How do {draftPronoun} want to follow up?</Text>
                  <View style={styles.chips}>
                    {SELECTABLE_FOLLOW_UP_CHANNELS.map((option) => (
                      <Pressable
                        key={option.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: draftChannel === option.id }}
                        onPress={() => setDraftChannel(option.id)}
                        style={[styles.chip, draftChannel === option.id && styles.chipActive]}>
                        <Text style={[styles.chipText, draftChannel === option.id && styles.chipTextActive]}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <FollowUpDuePicker dueAt={draftDueAt} onChange={setDraftDueAt} label={`When should ${draftPronoun} do this?`} />

                <View style={styles.fieldGroup}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: draftDetailOpen }}
                    onPress={() => setDraftDetailOpen((value) => !value)}
                    style={styles.detailToggle}>
                    <Text style={styles.label}>What do {draftPronoun} need to do? (optional)</Text>
                    {draftDetailOpen ? (
                      <CaretUp size={16} color={colors.ink} weight="bold" />
                    ) : (
                      <CaretDown size={16} color={colors.ink} weight="bold" />
                    )}
                  </Pressable>
                  {draftDetailOpen ? (
                    <>
                      <Text style={styles.linkHint}>Shown in your reminders so you know what this one&apos;s about.</Text>
                      <TextInput
                        value={draftTitle}
                        onChangeText={setDraftTitle}
                        placeholder="e.g. Send Sarah the revised product draft"
                        placeholderTextColor={colors.muted}
                        multiline
                        style={[styles.input, styles.inputMultiline]}
                      />
                    </>
                  ) : null}
                </View>
              </>
            );
          })()}
        </BottomSheet>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.x2 }]}>
        <Button loading={saving} disabled={saving} onPress={() => void submit()}>
          <CheckCircle size={19} color={colors.ink} weight="bold" />
          Save follow-ups
        </Button>
      </View>

      <BottomSheet
        visible={Boolean(editingItem)}
        title="Edit follow-up"
        onClose={() => setEditingFollowUpId('')}
        footer={<Button onPress={() => setEditingFollowUpId('')}>Done</Button>}>
        {editingItem ? (
          <>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Owner</Text>
              <View style={styles.chips}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: editingItem.owner === 'me' }}
                  onPress={() => updateFollowUp(editingItem.id, { owner: 'me' })}
                  style={[styles.chip, editingItem.owner === 'me' && styles.chipActive]}>
                  <Text style={[styles.chipText, editingItem.owner === 'me' && styles.chipTextActive]}>You</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: editingItem.owner === 'guest' }}
                  onPress={() => updateFollowUp(editingItem.id, { owner: 'guest' })}
                  style={[styles.chip, editingItem.owner === 'guest' && styles.chipActive]}>
                  <Text style={[styles.chipText, editingItem.owner === 'guest' && styles.chipTextActive]}>
                    {personName.trim() || 'Them'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>How do {editingPronoun} want to follow up?</Text>
              <View style={styles.chips}>
                {SELECTABLE_FOLLOW_UP_CHANNELS.map((option) => (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: editingItem.channel === option.id }}
                    onPress={() => updateFollowUp(editingItem.id, { channel: option.id })}
                    style={[styles.chip, editingItem.channel === option.id && styles.chipActive]}>
                    <Text style={[styles.chipText, editingItem.channel === option.id && styles.chipTextActive]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <FollowUpDuePicker
              dueAt={editingItem.dueAt}
              onChange={(nextDueAt) => updateFollowUp(editingItem.id, { dueAt: nextDueAt })}
              label={`When should ${editingPronoun} do this?`}
            />

            <View style={styles.fieldGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: Boolean(followUpDetailOpen[editingItem.id]) }}
                onPress={() => setFollowUpDetailOpen((current) => ({ ...current, [editingItem.id]: !current[editingItem.id] }))}
                style={styles.detailToggle}>
                <Text style={styles.label}>What do {editingPronoun} need to do? (optional)</Text>
                {followUpDetailOpen[editingItem.id] ? (
                  <CaretUp size={16} color={colors.ink} weight="bold" />
                ) : (
                  <CaretDown size={16} color={colors.ink} weight="bold" />
                )}
              </Pressable>
              {followUpDetailOpen[editingItem.id] ? (
                <>
                  <Text style={styles.linkHint}>Shown in your reminders so you know what this one&apos;s about.</Text>
                  <TextInput
                    value={editingItem.title}
                    onChangeText={(value) => updateFollowUp(editingItem.id, { title: value })}
                    placeholder="e.g. Send Sarah the revised product draft"
                    placeholderTextColor={colors.muted}
                    multiline
                    style={[styles.input, styles.inputMultiline]}
                  />
                </>
              ) : null}
            </View>
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={addPersonSheetOpen}
        title="Add someone"
        onClose={() => {
          setAddPersonSheetOpen(false);
          setPersonSearchQuery('');
        }}>
        <View style={styles.searchRow}>
          <MagnifyingGlass size={18} color={colors.muted} weight="bold" />
          <TextInput
            value={personSearchQuery}
            onChangeText={setPersonSearchQuery}
            placeholder="Search your contacts"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={styles.searchInput}
          />
          {personSearchQuery.trim() ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setPersonSearchQuery('')} hitSlop={8}>
              <X size={18} color={colors.muted} weight="bold" />
            </Pressable>
          ) : null}
        </View>

        {personSearchQuery.trim() && searchResults.length ? (
          <View style={styles.resultsList}>
            {searchResults.map((connection) => (
              <Pressable
                key={connection.id}
                accessibilityRole="button"
                onPress={() => pickConnection(connection)}
                style={styles.resultCard}>
                <Text style={styles.resultName}>{connection.name}</Text>
                <Text style={styles.linkHint}>{connection.email || connection.subtitle}</Text>
              </Pressable>
            ))}
          </View>
        ) : !personSearchQuery.trim() ? (
          <View style={styles.personChoiceList}>
            <Pressable accessibilityRole="button" onPress={() => setManualOpen(true)} style={styles.personChoice}>
              <View style={styles.personChoiceIcon}>
                <PencilSimple size={20} color={colors.ink} weight="bold" />
              </View>
              <View style={styles.personChoiceCopy}>
                <Text style={styles.personChoiceTitle}>Add manually</Text>
                <Text style={styles.linkHint}>Enter their name and contact details</Text>
              </View>
              <CaretRight size={16} color={colors.muted} weight="bold" />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setQrOpen(true)} style={styles.personChoice}>
              <View style={styles.personChoiceIcon}>
                <QrCode size={20} color={colors.ink} weight="bold" />
              </View>
              <View style={styles.personChoiceCopy}>
                <Text style={styles.personChoiceTitle}>Share QR code</Text>
                <Text style={styles.linkHint}>Let them scan your card and return their details</Text>
              </View>
              <CaretRight size={16} color={colors.muted} weight="bold" />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void openScans()} style={styles.personChoice}>
              <View style={styles.personChoiceIcon}>
                <Scan size={20} color={colors.ink} weight="bold" />
              </View>
              <View style={styles.personChoiceCopy}>
                <Text style={styles.personChoiceTitle}>Recent scans</Text>
                <Text style={styles.linkHint}>Choose someone who recently scanned your card</Text>
              </View>
              <CaretRight size={16} color={colors.muted} weight="bold" />
            </Pressable>
          </View>
        ) : (
          <Body style={styles.centerCopy}>No contacts match &ldquo;{personSearchQuery.trim()}&rdquo;.</Body>
        )}
      </BottomSheet>

      <BottomSheet
        visible={manualOpen}
        title="Add someone"
        onClose={() => setManualOpen(false)}
        footer={<Button onPress={saveManualPerson}>Add person</Button>}>
        <Text style={styles.label}>Full name</Text>
        <TextInput
          value={manualName}
          onChangeText={setManualName}
          placeholder="Full name"
          placeholderTextColor={colors.muted}
          autoComplete="name"
          style={styles.input}
        />
        <Text style={styles.label}>Email</Text>
        <TextInput
          value={manualEmail}
          onChangeText={setManualEmail}
          placeholder="name@company.com"
          placeholderTextColor={colors.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />
      </BottomSheet>

      <BottomSheet
        visible={qrOpen}
        title="Share your card"
        onClose={() => setQrOpen(false)}
        footer={
          <Button variant="secondary" onPress={() => { setQrOpen(false); router.push('/share-card'); }}>
            Open full-screen QR
          </Button>
        }>
        <Body style={styles.centerCopy}>They scan this code and their details link here automatically.</Body>
        <View style={styles.qrWrap}>
          <BrandedQrCode card={card} cardUrl={publicUrl} size={220} />
          <Text style={styles.qrHint}>{card.name}</Text>
        </View>
      </BottomSheet>

      <BottomSheet visible={scansOpen} title="Recent scans" onClose={() => setScansOpen(false)}>
        {loadingExchanges ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.ink} />
            <Text style={styles.linkHint}>Checking for new scans…</Text>
          </View>
        ) : exchanges.length ? (
          <View style={styles.resultsList}>
            {exchanges.map((exchange) => (
              <Pressable key={exchange.id} accessibilityRole="button" onPress={() => pickExchange(exchange)} style={styles.resultCard}>
                <Text style={styles.resultName}>{exchange.visitor_name || 'Unknown visitor'}</Text>
                <Text style={styles.linkHint}>
                  {[exchange.visitor_email, exchange.visitor_phone].filter(Boolean).join(' · ') || 'No contact yet'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Body style={styles.centerCopy}>No recent scans yet. Share your QR and new submissions appear here.</Body>
        )}
      </BottomSheet>

      <OutcomeErrorSheet
        visible={Boolean(outcomeError)}
        message={outcomeError}
        onClose={() => setOutcomeError('')}
      />
      <OutcomeSuccessSheet
        visible={successOpen}
        title={queuedOffline ? 'Saved for when you’re back online' : 'Follow-up added'}
        message={queuedOffline
          ? "You're offline — this will be added to Follow-ups automatically the moment you reconnect."
          : newGuestName
            ? `It is now in Follow-ups. We also emailed ${newGuestName} to let them know and invite them to claim their own ehllo card.`
            : 'It is now in Follow-ups and will stay there until you complete it.'}
        onClose={() => router.replace('/settings/follow-ups')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: spacing.x5, gap: spacing.x2 },
  scroll: { flex: 1, marginTop: spacing.x4 },
  content: { paddingHorizontal: spacing.x5, gap: spacing.x3, paddingBottom: spacing.x4 },
  footer: {
    paddingHorizontal: spacing.x5,
    paddingTop: spacing.x3,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  linkHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  personTrigger: {
    minHeight: 72,
    padding: spacing.x5,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
  },
  personTriggerCopy: { flex: 1, gap: 2 },
  personTriggerName: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  actionList: { gap: spacing.x2 },
  actionItem: { overflow: 'hidden', borderRadius: radius.medium, backgroundColor: colors.surface },
  actionRow: { minHeight: 54, padding: spacing.x3, flexDirection: 'row', alignItems: 'center', gap: spacing.x3, borderRadius: radius.medium, backgroundColor: colors.surface },
  actionCopy: { flex: 1, gap: 2 },
  actionTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  actionComposerToggle: {
    minHeight: 46,
    paddingHorizontal: spacing.x4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.x3,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
  },
  actionComposerToggleCopy: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  actionComposerToggleText: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  fieldGroup: { gap: spacing.x3 },
  detailToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 },
  chip: {
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x2,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: colors.white },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.x4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.small,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 92, paddingTop: spacing.x4 },
  error: {
    padding: spacing.x3,
    borderRadius: radius.small,
    backgroundColor: '#FEE4E2',
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  eventContext: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    minHeight: 48,
    paddingHorizontal: spacing.x4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
  },
  searchInput: { flex: 1, color: colors.ink, fontSize: 15, textAlign: 'left' },
  resultsList: { gap: spacing.x2, marginTop: spacing.x3 },
  resultCard: {
    gap: 2,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
  },
  resultName: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  personChoiceList: { gap: spacing.x2, marginTop: spacing.x3 },
  personChoice: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x3,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
  },
  personChoiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  personChoiceCopy: { flex: 1, gap: 2 },
  personChoiceTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  centerCopy: { textAlign: 'center', marginTop: spacing.x3 },
  qrWrap: { alignItems: 'center', gap: spacing.x3, marginTop: spacing.x4 },
  qrHint: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2, marginTop: spacing.x3 },
});
