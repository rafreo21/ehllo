import { router } from 'expo-router';
import {
  CaretRight,
  CheckCircle,
  IdentificationCard,
  MagnifyingGlass,
  Microphone,
  Pause,
  PencilSimple,
  Play,
  Plus,
  QrCode,
  Scan,
  Stop,
  Trash,
  X,
} from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BrandedQrCode } from '@/components/branded-qr-code';
import { BottomSheet } from '@/components/bottom-sheet';
import { PhoneInput } from '@/components/phone-input';
import { RecordingPlayOrb } from '@/components/recording-playback';
import { Body, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useCard } from '@/features/card/card-context';
import { useActiveEventTitle } from '@/features/events/use-active-event-title';
import type { CaptureWizardDraft } from '@/features/encounters/capture-draft';
import type { InboundExchange } from '@/features/encounters/encounter-api';
import {
  createGatherPerson,
  formatPrimaryContactLine,
  MAX_GATHER_PEOPLE,
  syncLegacyPersonFields,
  updateGatherPerson,
  type GatherPerson,
} from '@/features/encounters/gather-people';
import { filterConnections, type ConnectionItem } from '@/features/connections/connections-api';
import { fetchDeviceContacts, filterDeviceContacts, type DeviceContactMatch } from '@/features/connections/device-contacts';
import type { CaptureRecorder } from '@/features/encounters/use-capture-recorder';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

type CaptureInteractionStepProps = {
  draft: CaptureWizardDraft;
  onDraftChange: (changes: Partial<CaptureWizardDraft>) => void;
  consent: boolean;
  consentMethod: 'verbal' | 'written';
  onConsentChange: (value: boolean) => void;
  onConsentMethodChange: (value: 'verbal' | 'written') => void;
  recorder: CaptureRecorder;
  signedIn: boolean;
  exchanges: InboundExchange[];
  loadingExchanges: boolean;
  onLinkExchange: (exchange: InboundExchange) => void;
  connections?: ConnectionItem[];
  onLinkConnection?: (connection: ConnectionItem) => void;
  onEnsureAuth: () => Promise<string | null>;
  getPriorMeetingCount?: (email: string) => number;
  knownConnectionEmails?: string[];
  onPathStateChange?: (started: boolean) => void;
  openConsentOnMount?: boolean;
};

function metBeforeLabelForPerson(
  person: GatherPerson,
  getPriorMeetingCount?: (email: string) => number,
  knownConnectionEmails: string[] = [],
) {
  const email = person.email.trim().toLowerCase();
  const priorCount = getPriorMeetingCount?.(person.email) ?? 0;
  const knownConnection = email && knownConnectionEmails.includes(email);
  if (priorCount > 0) {
    return `You've met before · ${priorCount} conversation${priorCount === 1 ? '' : 's'}`;
  }
  if (knownConnection) return 'Already in your connections';
  return null;
}

function MeetingPersonCard({
  person,
  metBeforeLabel,
  onEdit,
  onRemove,
}: {
  person: GatherPerson;
  metBeforeLabel: string | null;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const contactLine = formatPrimaryContactLine(person);

  return (
    <View style={styles.personCard}>
      <CheckCircle size={20} color={colors.ink} weight="fill" />
      <View style={styles.personCopy}>
        <Text style={styles.personName}>{person.name.trim()}</Text>
        {contactLine ? <Text style={styles.personMeta}>{contactLine}</Text> : null}
        {person.exchangeId ? (
          <Text style={styles.personBadge}>From card scan</Text>
        ) : null}
        {metBeforeLabel ? (
          <Text style={styles.personHistoryBadge}>{metBeforeLabel}</Text>
        ) : null}
      </View>
      <View style={styles.personActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${person.name}`}
          onPress={onEdit}
          style={styles.iconButton}>
          <PencilSimple size={15} color={colors.ink} weight="bold" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${person.name}`}
          onPress={onRemove}
          style={styles.iconButton}>
          <Trash size={15} color={colors.danger} weight="bold" />
        </Pressable>
      </View>
    </View>
  );
}

function PersonFields({
  person,
  onChange,
  personError,
}: {
  person: GatherPerson;
  onChange: (changes: Partial<GatherPerson>) => void;
  personError?: string;
}) {
  return (
    <>
      <Text style={styles.label}>Full name</Text>
      <TextInput
        value={person.name}
        onChangeText={(value) => onChange({ name: value })}
        placeholder="Full name"
        placeholderTextColor={colors.muted}
        autoComplete="name"
        style={styles.input}
      />
      <Text style={styles.label}>Email</Text>
      <TextInput
        value={person.email}
        onChangeText={(value) => onChange({ email: value })}
        placeholder="name@company.com"
        placeholderTextColor={colors.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        style={styles.input}
      />
      <PhoneInput
        label="Phone (optional)"
        value={person.phone}
        onChange={(value) => onChange({ phone: value })}
      />
      <Text style={styles.label}>LinkedIn (optional)</Text>
      <TextInput
        value={person.linkedIn}
        onChangeText={(value) => onChange({ linkedIn: value })}
        placeholder="Profile URL or username"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        style={styles.input}
      />
      {personError ? <Text style={styles.error}>{personError}</Text> : null}
    </>
  );
}

export function CaptureInteractionStep({
  draft,
  onDraftChange,
  consent,
  consentMethod,
  onConsentChange,
  onConsentMethodChange,
  recorder,
  signedIn,
  exchanges,
  loadingExchanges,
  onLinkExchange,
  connections = [],
  onLinkConnection,
  onEnsureAuth,
  getPriorMeetingCount,
  knownConnectionEmails = [],
  onPathStateChange,
  openConsentOnMount = false,
}: CaptureInteractionStepProps) {
  const { card, publicUrl } = useCard();
  const { session } = useAuth();
  const activeEventTitle = useActiveEventTitle(session?.access_token);
  const qrCardUrl = publicUrl && activeEventTitle
    ? `${publicUrl}?event=${encodeURIComponent(activeEventTitle)}`
    : publicUrl;
  const [consentIntent, setConsentIntent] = useState<'confirm' | 'record' | 'continue' | null>(() => (
    openConsentOnMount && recorder.recordingState === 'idle' ? 'record' : null
  ));
  const [addPersonSheetOpen, setAddPersonSheetOpen] = useState(false);
  const [personSearchQuery, setPersonSearchQuery] = useState('');
  const [deviceContacts, setDeviceContacts] = useState<DeviceContactMatch[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [scansOpen, setScansOpen] = useState(false);
  const [peopleSheetOpen, setPeopleSheetOpen] = useState(false);
  const [personError, setPersonError] = useState('');
  const [formPerson, setFormPerson] = useState<GatherPerson>(createGatherPerson());
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const people = draft.people ?? [];
  const pathStarted = true;
  const atCapacity = people.length >= MAX_GATHER_PEOPLE;
  const methodLabel = consentMethod === 'verbal' ? 'Verbal consent' : 'Written consent';
  const isRecording = recorder.recordingState === 'recording' || recorder.recordingState === 'paused';
  const isImported = recorder.recordingSource === 'imported';
  const isTranscribingImport =
    recorder.serverTranscribePhase === 'preparing'
    || recorder.serverTranscribePhase === 'transcribing'
    || recorder.serverTranscribePhase === 'revealing'
    || recorder.transcriptStatus === 'transcribing';

  const liveTranscriptHint = (() => {
    switch (recorder.serverTranscribePhase) {
      case 'preparing':
        return 'Reading audio file…';
      case 'transcribing':
        return 'Transcribing recording…';
      case 'revealing':
        return 'Writing transcript…';
      case 'failed':
        return recorder.serverTranscribeError || 'Transcription failed';
      case 'done':
        return 'Transcript ready. Edit if needed';
      default:
        if (recorder.transcriptStatus === 'transcribing') return 'Transcribing recording…';
        if (recorder.transcriptStatus === 'receiving') return 'Receiving speech live…';
        if (recorder.transcriptStatus === 'listening') return 'Listening for words…';
        if (isRecording) return 'Listening for words…';
        return recorder.displayTranscript.trim() ? 'Editable meeting record' : 'Transcript will appear here';
    }
  })();

  // The Finish button and the interruption watchdog both land the recorder
  // in 'stopped' with a real recordingUri - this is the only signal telling
  // them apart, so "resume, nothing lost" only shows for the latter.
  const wasInterrupted = draft.failureReason === 'recording_auto_saved_interrupted';

  const recorderTitle = isTranscribingImport
    ? 'Transcribing import'
    : recorder.recordingState === 'recording'
      ? 'Recording'
      : recorder.recordingState === 'paused'
        ? 'Paused'
        : recorder.recordingState === 'stopped'
          ? (isImported ? 'Imported recording' : wasInterrupted ? 'Recording paused' : 'Recording ready')
          : 'Ready to capture';

  useEffect(() => {
    onPathStateChange?.(true);
  }, [onPathStateChange]);

  useEffect(() => {
    if (!addPersonSheetOpen || deviceContacts.length) return;
    // Fetch once per sheet session and filter client-side per keystroke -
    // re-requesting permission and re-reading the address book on every
    // character typed would be slow and intrusive.
    void fetchDeviceContacts().then(setDeviceContacts).catch(() => {});
  }, [addPersonSheetOpen, deviceContacts.length]);

  function updatePeople(nextPeople: GatherPerson[]) {
    onDraftChange(syncLegacyPersonFields(nextPeople.slice(0, MAX_GATHER_PEOPLE)));
  }

  function openManualSheet(person?: GatherPerson) {
    setPersonError('');
    if (person) {
      setFormPerson({ ...person });
      setEditingPersonId(person.id);
    } else {
      setFormPerson(createGatherPerson());
      setEditingPersonId(null);
    }
    setManualOpen(true);
  }

  function openFromPersonChooser(action: 'manual' | 'qr' | 'scans') {
    setAddPersonSheetOpen(false);
    requestAnimationFrame(() => {
      if (action === 'manual') {
        openManualSheet();
        return;
      }
      if (action === 'qr') {
        setQrOpen(true);
        return;
      }
      if (signedIn) {
        setScansOpen(true);
      } else {
        void onEnsureAuth();
      }
    });
  }

  function validatePerson(person: GatherPerson) {
    if (person.name.trim().length < 2) {
      setPersonError('Enter their full name.');
      return false;
    }
    if (!person.email.trim().includes('@')) {
      setPersonError('Email is required.');
      return false;
    }
    setPersonError('');
    return true;
  }

  function savePerson() {
    if (!validatePerson(formPerson)) return;
    const normalized = createGatherPerson(formPerson);
    const nextPeople = editingPersonId
      ? people.map((person) => (person.id === editingPersonId ? { ...normalized, id: editingPersonId } : person))
      : [...people, normalized];
    updatePeople(nextPeople);
    setManualOpen(false);
    setEditingPersonId(null);
    setFormPerson(createGatherPerson());
  }

  function removePerson(personId: string) {
    updatePeople(people.filter((person) => person.id !== personId));
  }

  function requestRecordingStart() {
    setConsentIntent('record');
  }

  function closeConsentSheet() {
    setConsentIntent(null);
  }

  function confirmConsent() {
    const intent = consentIntent;
    setConsentIntent(null);
    if (intent === 'record') {
      requestAnimationFrame(() => {
        void recorder.startRecording(true);
      });
    } else if (intent === 'continue') {
      requestAnimationFrame(() => {
        void recorder.continueRecording(true);
      });
    }
  }

  return (
    <View style={styles.stack}>
      {pathStarted && draft.captureMode === 'recording' ? (
      <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isRecording }}
        disabled={isRecording}
        onPress={() => setConsentIntent('confirm')}
        style={[styles.consentChip, consent && styles.consentChipConfirmed]}>
        {consent ? (
          <CheckCircle size={18} color={colors.ink} weight="fill" />
        ) : (
          <Microphone size={18} color={colors.ink} weight="bold" />
        )}
        <Text style={styles.consentChipText}>
          {consent ? `${methodLabel} confirmed` : 'Confirm recording consent'}
        </Text>
        <CaretRight size={14} color={colors.muted} weight="bold" />
      </Pressable>

      <View style={styles.recorderCard}>
          <View style={styles.recorderRow}>
            {recorder.recordingState === 'stopped' && recorder.recordingUri ? (
              <RecordingPlayOrb uri={recorder.recordingUri} durationSeconds={recorder.seconds} size={44} />
            ) : (
              <View style={[styles.micOrb, recorder.recordingState === 'recording' && styles.micOrbActive]}>
                <Microphone
                  size={22}
                  color={recorder.recordingState === 'recording' ? colors.white : colors.ink}
                  weight="fill"
                />
              </View>
            )}
            <View style={styles.recorderMeta}>
              <Text style={styles.recorderTitle}>
                {isRecording
                  ? recorder.recordingState === 'paused' ? 'Recording paused' : 'Recording in progress'
                  : recorderTitle}
              </Text>
              <Text style={styles.recorderHint}>
                {isRecording
                  ? 'Add people while you listen. Your private transcript stays with you.'
                  : isTranscribingImport ? liveTranscriptHint : recorder.transcriptStatusLabel}
              </Text>
            </View>
            <Text style={styles.recorderTime}>{recorder.formattedDuration}</Text>
          </View>

          {isRecording ? (
            <View style={styles.audioMeter}>
              {Array.from({ length: 12 }, (_, index) => (
                <View
                  key={index}
                  style={[
                    styles.audioBar,
                    { height: Math.max(4, recorder.audioLevel * (8 + ((index * 4) % 16))) },
                  ]}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.recorderActions}>
            {recorder.recordingState === 'idle' ? (
              <Button style={styles.flexButton} onPress={requestRecordingStart}>
                Record
              </Button>
            ) : null}
            {isRecording ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={recorder.recordingState === 'paused' ? 'Resume recording' : 'Pause recording'}
                  onPress={() => void recorder.pauseOrResume()}
                  style={styles.liveControlButton}>
                  {recorder.recordingState === 'paused'
                    ? <Play size={18} color={colors.ink} weight="fill" />
                    : <Pause size={18} color={colors.ink} weight="fill" />}
                  <Text style={styles.liveControlText}>
                    {recorder.recordingState === 'paused' ? 'Resume' : 'Pause'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="End recording"
                  onPress={() => void recorder.stopRecording()}
                  style={styles.liveEndButton}>
                  <Stop size={17} color={colors.white} weight="fill" />
                  <Text style={styles.liveEndText}>End</Text>
                </Pressable>
              </>
            ) : null}
            {recorder.recordingState === 'stopped' ? (
              <Button
                variant="secondary"
                onPress={() => {
                  if (wasInterrupted) {
                    // Preserve the segment/transcript already captured -
                    // resetRecording would throw it away, which is exactly
                    // what "resume" must not do.
                    onConsentChange(false);
                    setConsentIntent('continue');
                    return;
                  }
                  void recorder.resetRecording();
                  onConsentChange(false);
                  setConsentIntent('record');
                }}>
                {wasInterrupted ? 'Resume recording' : 'Record again'}
              </Button>
            ) : null}
          </View>

      </View>
      </>
      ) : null}

      {pathStarted && (draft.captureMode === 'quick_context' || consent) ? <View style={styles.peopleSection}>
        <View style={styles.sectionHead}>
          <IdentificationCard size={18} color={colors.ink} weight="bold" />
          <View style={styles.sectionHeadCopy}>
            <Text style={styles.sectionTitle}>Who&apos;s in this meeting?</Text>
            <Text style={styles.sectionHint}>Add people while you record. Pausing won&apos;t stop this.</Text>
          </View>
        </View>

        {people.length ? (
          <View style={styles.peopleList}>
            <MeetingPersonCard
              person={people[0]}
              metBeforeLabel={metBeforeLabelForPerson(people[0], getPriorMeetingCount, knownConnectionEmails)}
              onEdit={() => openManualSheet(people[0])}
              onRemove={() => removePerson(people[0].id)}
            />
            {people.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setPeopleSheetOpen(true)}
                style={styles.viewAllPeople}>
                <Text style={styles.viewAllPeopleText}>
                  View all {people.length} people
                </Text>
                <CaretRight size={14} color={colors.inkSoft} weight="bold" />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a person to this meeting"
          onPress={() => setAddPersonSheetOpen(true)}
          style={({ pressed }) => [styles.addPersonButton, pressed && styles.addPersonButtonPressed]}>
          <Plus size={22} color={colors.ink} weight="bold" />
          <Text style={styles.addPersonButtonText}>Add person</Text>
          {exchanges.length > 0 ? <View style={styles.addPersonBadge}>
            <Text style={styles.addPersonBadgeText}>{exchanges.length}</Text>
          </View> : null}
        </Pressable>
      </View> : null}

      <BottomSheet
        visible={consentIntent !== null}
        title="Before you record"
        onClose={closeConsentSheet}
        footer={
          <Button disabled={!consent} onPress={confirmConsent}>
            {consentIntent === 'record' ? 'Confirm and record' : consentIntent === 'continue' ? 'Confirm and resume' : 'Confirm consent'}
          </Button>
        }>
        <Body>
          Ask clearly: “Is everyone comfortable with me recording this conversation so I can remember the agreed next steps?” Nothing is shared until you review it.
        </Body>
        <View style={styles.consentRow}>
          <Text style={styles.consentLabel}>Everyone agreed</Text>
          <Switch
            value={consent}
            onValueChange={onConsentChange}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.white}
          />
        </View>
        <Text style={styles.methodHeading}>How was consent given?</Text>
        <View style={styles.methodRow}>
          {(['verbal', 'written'] as const).map((method) => (
            <Pressable
              key={method}
              accessibilityRole="button"
              onPress={() => onConsentMethodChange(method)}
              style={[styles.methodChip, consentMethod === method && styles.methodChipActive]}>
              <Text style={[styles.methodText, consentMethod === method && styles.methodTextActive]}>
                {method === 'verbal' ? 'Verbal' : 'Written'}
              </Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={addPersonSheetOpen}
        title="Add someone"
        onClose={() => {
          setAddPersonSheetOpen(false);
          setPersonSearchQuery('');
        }}>
        <Body>Choose the quickest way to connect this person to the meeting.</Body>
        <View style={styles.personSearchRow}>
          <MagnifyingGlass size={18} color={colors.muted} weight="bold" />
          <TextInput
            value={personSearchQuery}
            onChangeText={setPersonSearchQuery}
            placeholder="Search your contacts"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={styles.personSearchInput}
          />
          {personSearchQuery.trim() ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setPersonSearchQuery('')}
              hitSlop={8}>
              <X size={18} color={colors.muted} weight="bold" />
            </Pressable>
          ) : null}
        </View>
        {(() => {
          const query = personSearchQuery.trim();
          const searchResults = query ? filterConnections(connections, query) : [];
          const deviceMatches = query ? filterDeviceContacts(deviceContacts, query) : [];
          if (query && (searchResults.length || deviceMatches.length)) {
            return (
              <View style={[styles.exchangeList, styles.personSearchResults]}>
                {searchResults.length ? (
                  <Text style={styles.personSearchSectionLabel}>Your connections</Text>
                ) : null}
                {searchResults.map((connection) => {
                  const email = connection.email?.trim().toLowerCase();
                  const already = Boolean(email) && people.some((person) => person.email.trim().toLowerCase() === email);
                  const disabled = already || atCapacity;
                  return (
                    <Pressable
                      key={connection.id}
                      accessibilityRole="button"
                      disabled={disabled}
                      onPress={() => {
                        onLinkConnection?.(connection);
                        setAddPersonSheetOpen(false);
                        setPersonSearchQuery('');
                      }}
                      style={[
                        styles.exchangeCard,
                        already && styles.exchangeCardSelected,
                        disabled && !already && styles.exchangeCardDisabled,
                      ]}>
                      <Text style={styles.exchangeName}>{connection.name}</Text>
                      <Text style={styles.exchangeMeta}>
                        {[connection.email, connection.phone].filter(Boolean).join(' · ') || connection.subtitle}
                      </Text>
                      {already ? <Text style={styles.exchangeSelected}>Added</Text> : null}
                    </Pressable>
                  );
                })}
                {deviceMatches.length ? (
                  <Text style={styles.personSearchSectionLabel}>From your phone</Text>
                ) : null}
                {deviceMatches.map((contact) => {
                  const email = contact.email.trim().toLowerCase();
                  const already = Boolean(email) && people.some((person) => person.email.trim().toLowerCase() === email);
                  const disabled = already || atCapacity;
                  return (
                    <Pressable
                      key={contact.id}
                      accessibilityRole="button"
                      disabled={disabled}
                      onPress={() => {
                        setAddPersonSheetOpen(false);
                        setPersonSearchQuery('');
                        openManualSheet(createGatherPerson({ name: contact.name, email: contact.email, phone: contact.phone }));
                      }}
                      style={[
                        styles.exchangeCard,
                        already && styles.exchangeCardSelected,
                        disabled && !already && styles.exchangeCardDisabled,
                      ]}>
                      <Text style={styles.exchangeName}>{contact.name}</Text>
                      <Text style={styles.exchangeMeta}>
                        {[contact.email, contact.phone].filter(Boolean).join(' · ')}
                      </Text>
                      {already ? <Text style={styles.exchangeSelected}>Added</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            );
          }
          return (
            <View style={styles.personChoiceList}>
              <Pressable
                accessibilityRole="button"
                disabled={atCapacity}
                onPress={() => openFromPersonChooser('manual')}
                style={[styles.personChoice, atCapacity && styles.personChoiceDisabled]}>
                <View style={styles.personChoiceIcon}>
                  <PencilSimple size={20} color={colors.ink} weight="bold" />
                </View>
                <View style={styles.personChoiceCopy}>
                  <Text style={styles.personChoiceTitle}>Add manually</Text>
                  <Text style={styles.personChoiceHint}>{atCapacity ? 'Meeting is at its participant limit' : 'Enter their name and contact details'}</Text>
                </View>
                <CaretRight size={16} color={colors.muted} weight="bold" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => openFromPersonChooser('qr')}
                style={styles.personChoice}>
                <View style={styles.personChoiceIcon}>
                  <QrCode size={20} color={colors.ink} weight="bold" />
                </View>
                <View style={styles.personChoiceCopy}>
                  <Text style={styles.personChoiceTitle}>Share QR code</Text>
                  <Text style={styles.personChoiceHint}>Let them scan your card and return their details</Text>
                </View>
                <CaretRight size={16} color={colors.muted} weight="bold" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => openFromPersonChooser('scans')}
                style={styles.personChoice}>
                <View style={styles.personChoiceIcon}>
                  <Scan size={20} color={colors.ink} weight="bold" />
                </View>
                <View style={styles.personChoiceCopy}>
                  <Text style={styles.personChoiceTitle}>Recent scans</Text>
                  <Text style={styles.personChoiceHint}>{exchanges.length ? `${exchanges.length} available to add` : 'Choose someone who recently scanned your card'}</Text>
                </View>
                {exchanges.length > 0 ? <View style={styles.choiceCount}>
                  <Text style={styles.choiceCountText}>{exchanges.length}</Text>
                </View> : <CaretRight size={16} color={colors.muted} weight="bold" />}
              </Pressable>
            </View>
          );
        })()}
      </BottomSheet>

      <BottomSheet
        visible={manualOpen}
        title={editingPersonId ? 'Edit person' : 'Add person'}
        onClose={() => setManualOpen(false)}
        footer={<Button onPress={savePerson}>{editingPersonId ? 'Save changes' : 'Add person'}</Button>}>
        <PersonFields
          person={formPerson}
          onChange={(changes) => setFormPerson((current) => updateGatherPerson(current, changes))}
          personError={personError}
        />
      </BottomSheet>

      <BottomSheet
        visible={qrOpen}
        title="Share your card"
        onClose={() => setQrOpen(false)}
        footer={
          <Button variant="secondary" onPress={() => {
            setQrOpen(false);
            router.push('/share-card');
          }}>
            Open full-screen QR
          </Button>
        }>
        <Body style={styles.centerCopy}>They scan this code and their details link here automatically.</Body>
        <View style={styles.qrWrap}>
          <BrandedQrCode card={card} cardUrl={qrCardUrl} size={220} />
          <Text style={styles.qrHint}>{card.name}</Text>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={scansOpen}
        title="Recent scans"
        onClose={() => setScansOpen(false)}>
        {!signedIn ? (
          <Button onPress={() => void onEnsureAuth()}>Sign in to see recent scans</Button>
        ) : loadingExchanges ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.ink} />
            <Text style={styles.loadingText}>Checking for new scans…</Text>
          </View>
        ) : exchanges.length ? (
          <View style={styles.exchangeList}>
            {exchanges.map((exchange) => {
              const selected = people.some((person) => person.exchangeId === exchange.id);
              const disabled = selected || atCapacity;
              return (
                <Pressable
                  key={exchange.id}
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => {
                    onLinkExchange(exchange);
                    setScansOpen(false);
                  }}
                  style={[
                    styles.exchangeCard,
                    selected && styles.exchangeCardSelected,
                    disabled && !selected && styles.exchangeCardDisabled,
                  ]}>
                  <Text style={styles.exchangeName}>{exchange.visitor_name || 'Unknown visitor'}</Text>
                  <Text style={styles.exchangeMeta}>
                    {[exchange.visitor_email, exchange.visitor_phone].filter(Boolean).join(' · ')
                      || exchange.visitor_company
                      || 'No contact yet'}
                  </Text>
                  {selected ? <Text style={styles.exchangeSelected}>Added</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Body style={styles.centerCopy}>No recent scans yet. Share your QR and new submissions appear here.</Body>
        )}
      </BottomSheet>

      <BottomSheet
        visible={peopleSheetOpen}
        title={`In this meeting (${people.length})`}
        onClose={() => setPeopleSheetOpen(false)}>
        <View style={styles.peopleList}>
          {people.map((person) => (
            <MeetingPersonCard
              key={person.id}
              person={person}
              metBeforeLabel={metBeforeLabelForPerson(person, getPriorMeetingCount, knownConnectionEmails)}
              onEdit={() => {
                setPeopleSheetOpen(false);
                openManualSheet(person);
              }}
              onRemove={() => removePerson(person.id)}
            />
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.x5 },
  destinationWrap: { gap: spacing.x3 },
  destinationTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, fontWeight: '800' },
  destinationList: { gap: spacing.x2 },
  destinationOption: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x3,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  destinationOptionActive: { borderColor: colors.ink, backgroundColor: colors.surfaceMuted },
  destinationCopy: { flex: 1, gap: 2 },
  destinationLabel: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold, fontWeight: '800' },
  destinationDetail: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 15 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.line },
  radioActive: { borderColor: colors.ink, backgroundColor: colors.accent },
  consentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    paddingHorizontal: spacing.x4,
    paddingVertical: spacing.x3,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  consentChipConfirmed: { backgroundColor: colors.surfaceMuted },
  consentChipText: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.medium, fontWeight: '700' },
  recorderCard: {
    gap: spacing.x4,
    padding: spacing.x5,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
  },
  recorderCardActive: { borderColor: colors.ink },
  recorderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  micOrb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
  },
  micOrbActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  recorderMeta: { flex: 1, gap: 2 },
  recorderTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, fontWeight: '800' },
  recorderHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  recorderTime: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold, fontWeight: '800', fontVariant: ['tabular-nums'] },
  audioMeter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    minHeight: 24,
    paddingHorizontal: spacing.x1,
  },
  audioBar: { flex: 1, borderRadius: 2, backgroundColor: colors.accent },
  recorderActions: { flexDirection: 'row', gap: spacing.x3 },
  liveControlButton: {
    minHeight: 52,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x2,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  liveControlText: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  liveEndButton: {
    minHeight: 52,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x2,
    borderRadius: radius.round,
    backgroundColor: colors.ink,
  },
  liveEndText: { color: colors.white, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  flexButton: { flex: 1 },
  addPersonButton: {
    width: '100%',
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x2,
    paddingHorizontal: spacing.x4,
    paddingVertical: spacing.x3,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    position: 'relative',
  },
  addPersonButtonPressed: { backgroundColor: colors.surfaceMuted },
  addPersonButtonText: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold, fontWeight: '800', textAlign: 'center' },
  addPersonBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  addPersonBadgeText: { color: colors.ink, fontSize: 10, fontFamily: fonts.extrabold, fontWeight: '900' },
  liveTranscriptPanel: {
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
  },
  liveTranscriptHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.x3,
  },
  liveTranscriptHeadCopy: { flex: 1, gap: 2 },
  liveTranscriptTitle: {
    color: colors.ink,
    fontSize: 12,
    fontFamily: fonts.bold, fontWeight: '800',
    letterSpacing: 0.6,
  },
  liveTranscriptHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  liveTranscriptField: {
    minHeight: 140,
    maxHeight: 220,
    padding: spacing.x3,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  transcribeFailRow: { gap: spacing.x3 },
  transcribeFailText: { color: colors.danger, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  peopleSection: { gap: spacing.x4 },
  sectionHead: { flexDirection: 'row', gap: spacing.x3, alignItems: 'flex-start' },
  sectionHeadCopy: { flex: 1, gap: 2 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.bold, fontWeight: '800' },
  sectionHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  peopleList: { gap: spacing.x2 },
  personCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.large,
    backgroundColor: '#EAF6E4',
  },
  personCopy: { flex: 1, gap: 2 },
  personName: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  personMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  personBadge: { marginTop: 2, color: colors.ink, fontSize: 10, fontFamily: fonts.bold, fontWeight: '800' },
  personHistoryBadge: { marginTop: 2, color: colors.inkSoft, fontSize: 11, fontFamily: fonts.bold, fontWeight: '800' },
  viewAllPeople: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x1,
    paddingVertical: spacing.x3,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  viewAllPeopleText: { color: colors.link, fontSize: 13, fontFamily: fonts.bold, fontWeight: '800' },
  personActions: { flexDirection: 'row', gap: spacing.x2 },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#CFE8C0',
  },
  emptyPeople: {
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyPeopleText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },
  personSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    minHeight: 48,
    paddingHorizontal: spacing.x4,
    marginTop: spacing.x3,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
  },
  personSearchInput: { flex: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: 15 },
  personSearchResults: { marginTop: spacing.x3 },
  personSearchSectionLabel: {
    marginTop: spacing.x2,
    color: colors.muted,
    fontSize: 11,
    fontFamily: fonts.bold, fontWeight: '800',
  },
  personChoiceList: { gap: spacing.x2, marginTop: spacing.x3 },
  personChoice: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x3,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  personChoiceDisabled: { opacity: 0.45 },
  personChoiceIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
  },
  personChoiceCopy: { flex: 1, gap: 2 },
  personChoiceTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  personChoiceHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  choiceCount: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: spacing.x2,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  choiceCountText: { color: colors.ink, fontSize: 11, fontFamily: fonts.extrabold, fontWeight: '900' },
  label: { color: colors.muted, fontSize: 11, fontFamily: fonts.bold, fontWeight: '800' },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.x4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 15,
  },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12 },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.x2,
  },
  consentLabel: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  methodHeading: {
    color: colors.muted,
    fontSize: 11,
    fontFamily: fonts.bold, fontWeight: '800',
    letterSpacing: 0.8,
  },
  methodRow: { flexDirection: 'row', gap: spacing.x2 },
  methodChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.x3,
    borderRadius: radius.round,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
  },
  methodChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  methodText: { color: colors.ink, fontSize: 13, fontFamily: fonts.medium, fontWeight: '700' },
  methodTextActive: { fontFamily: fonts.extrabold, fontWeight: '900' },
  centerCopy: { textAlign: 'center' },
  qrWrap: { alignItems: 'center', gap: spacing.x2, padding: spacing.x4, backgroundColor: colors.canvas, borderRadius: radius.medium },
  qrHint: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, fontWeight: '800' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3, paddingVertical: spacing.x2 },
  loadingText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14 },
  exchangeList: { gap: spacing.x3 },
  exchangeCard: {
    gap: spacing.x1,
    padding: spacing.x4,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  exchangeCardSelected: { borderColor: colors.ink, backgroundColor: colors.surfaceMuted },
  exchangeCardDisabled: { opacity: 0.55 },
  exchangeName: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  exchangeMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  exchangeSelected: { color: colors.ink, fontSize: 11, fontFamily: fonts.extrabold, fontWeight: '900' },
  transcriptSheetHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  transcriptField: {
    minHeight: 220,
    maxHeight: 320,
    padding: spacing.x4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 15,
    textAlignVertical: 'top',
  },
});
