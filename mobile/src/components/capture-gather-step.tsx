import { router } from 'expo-router';
import { CaretRight, CheckCircle, IdentificationCard, PencilSimple, QrCode, Trash } from 'phosphor-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BrandedQrCode } from '@/components/branded-qr-code';
import { BottomSheet } from '@/components/bottom-sheet';
import { PhoneInput } from '@/components/phone-input';
import { Body, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useCard } from '@/features/card/card-context';
import { useActiveEventTitle } from '@/features/events/use-active-event-title';
import type { CaptureWizardDraft } from '@/features/encounters/capture-draft';
import type { InboundExchange } from '@/features/encounters/encounter-api';
import {
  createGatherPerson,
  MAX_GATHER_PEOPLE,
  syncLegacyPersonFields,
  updateGatherPerson,
  type GatherPerson,
} from '@/features/encounters/gather-people';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CaptureGatherStepProps = {
  draft: CaptureWizardDraft;
  onDraftChange: (changes: Partial<CaptureWizardDraft>) => void;
  exchanges: InboundExchange[];
  loadingExchanges: boolean;
  signedIn: boolean;
  onLinkExchange: (exchange: InboundExchange) => void;
  onEnsureAuth: () => Promise<string | null>;
  isTranscribing?: boolean;
  hasRecording?: boolean;
};

type OptionRowProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
};

function OptionRow({ icon, title, subtitle, onPress, disabled }: Omit<OptionRowProps, 'isLast'>) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        pressed && !disabled && styles.optionRowPressed,
        disabled && styles.optionRowDisabled,
      ]}>
      <View style={styles.optionIcon}>{icon}</View>
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
      <CaretRight size={18} color={colors.muted} weight="bold" />
    </Pressable>
  );
}

function formatContactLine(person: GatherPerson) {
  return [person.email.trim(), person.phone.trim()].filter(Boolean).join(' · ');
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

export function CaptureGatherStep({
  draft,
  onDraftChange,
  exchanges,
  loadingExchanges,
  signedIn,
  onLinkExchange,
  onEnsureAuth,
  isTranscribing = false,
  hasRecording = false,
}: CaptureGatherStepProps) {
  const { card, publicUrl } = useCard();
  const { session } = useAuth();
  const activeEventTitle = useActiveEventTitle(session?.access_token);
  const qrCardUrl = publicUrl && activeEventTitle
    ? `${publicUrl}?event=${encodeURIComponent(activeEventTitle)}`
    : publicUrl;
  const [manualOpen, setManualOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [personError, setPersonError] = useState('');
  const [formPerson, setFormPerson] = useState<GatherPerson>(createGatherPerson());
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);

  const people = draft.people ?? [];
  const atCapacity = people.length >= MAX_GATHER_PEOPLE;

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

  function validatePerson(person: GatherPerson) {
    if (person.name.trim().length < 2) {
      setPersonError('Enter their full name.');
      return false;
    }
    if (!EMAIL_PATTERN.test(person.email.trim())) {
      setPersonError('Enter a valid email.');
      return false;
    }
    setPersonError('');
    return true;
  }

  const canSavePerson = formPerson.name.trim().length >= 2 && EMAIL_PATTERN.test(formPerson.email.trim());

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

  return (
    <View style={styles.stack}>
      {isTranscribing || (hasRecording && !draft.transcript.trim()) ? (
        <View style={styles.transcriptBanner}>
          <ActivityIndicator color={colors.ink} size="small" />
          <View style={styles.transcriptBannerCopy}>
            <Text style={styles.transcriptBannerTitle}>Generating transcript</Text>
            <Text style={styles.transcriptBannerBody}>
              Your imported recording is being transcribed. This powers the meeting title and share summary.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.prompt}>
        <View style={styles.promptHead}>
          <IdentificationCard size={18} color={colors.ink} weight="bold" />
          <Text style={styles.promptTitle}>Who did you meet?</Text>
        </View>
        <Body style={styles.promptCopy}>Add up to {MAX_GATHER_PEOPLE} people from this meeting.</Body>
      </View>

      {people.length ? (
        <View style={styles.peopleList}>
          {people.map((person) => (
            <View key={person.id} style={styles.addedCard}>
              <CheckCircle size={22} color={colors.ink} weight="fill" />
              <View style={styles.addedCopy}>
                <Text style={styles.addedTitle}>{person.name.trim()}</Text>
                <Text style={styles.addedMeta}>{formatContactLine(person) || 'Contact saved'}</Text>
                {person.linkedIn.trim() ? (
                  <Text style={styles.addedMeta}>{person.linkedIn.trim()}</Text>
                ) : null}
                {person.exchangeId ? (
                  <Text style={styles.addedBadge}>Linked from your card scan</Text>
                ) : null}
              </View>
              <View style={styles.addedActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${person.name}`}
                  onPress={() => openManualSheet(person)}
                  style={styles.iconButton}>
                  <PencilSimple size={16} color={colors.ink} weight="bold" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${person.name}`}
                  onPress={() => removePerson(person.id)}
                  style={styles.iconButton}>
                  <Trash size={16} color={colors.danger} weight="bold" />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.optionList}>
        <OptionRow
          icon={<PencilSimple size={22} color={colors.ink} weight="bold" />}
          title="Enter manually"
          subtitle={atCapacity ? 'Maximum people added' : 'Name, email, and optional details'}
          onPress={() => openManualSheet()}
          disabled={atCapacity}
        />
        <OptionRow
          icon={<QrCode size={22} color={colors.ink} weight="bold" />}
          title="Share your card"
          subtitle="They scan your QR and we link them automatically"
          onPress={() => setQrOpen(true)}
        />
      </View>

      {signedIn ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Recent scans</Text>
          {loadingExchanges ? (
            <Text style={styles.muted}>Checking for new details…</Text>
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
                    onPress={() => onLinkExchange(exchange)}
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
            <Text style={styles.muted}>No recent scans yet.</Text>
          )}
        </View>
      ) : (
        <Button onPress={() => void onEnsureAuth()}>Sign in to detect QR submissions</Button>
      )}

      <BottomSheet
        visible={manualOpen}
        title={editingPersonId ? 'Edit person' : 'Enter manually'}
        onClose={() => setManualOpen(false)}
        footer={<Button onPress={savePerson} disabled={!canSavePerson}>{editingPersonId ? 'Save changes' : 'Add person'}</Button>}>
        <Body>Add contact details for someone in this meeting.</Body>
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
        <Body style={styles.qrSheetCopy}>
          Ask them to scan this code. Their details link here automatically. You can add up to {MAX_GATHER_PEOPLE} people.
        </Body>
        <View style={styles.qrWrap}>
          <BrandedQrCode card={card} cardUrl={qrCardUrl} size={220} />
          <Text style={styles.qrHint}>{card.name}</Text>
          {card.role ? (
            <Text style={styles.qrSubhint}>
              {card.role}{card.company ? ` · ${card.company}` : ''}
            </Text>
          ) : null}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.x4 },
  transcriptBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.large,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  transcriptBannerCopy: { flex: 1, gap: 4 },
  transcriptBannerTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.extrabold, fontWeight: '800' },
  transcriptBannerBody: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  prompt: { gap: spacing.x2 },
  promptHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  promptTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.extrabold, fontWeight: '800' },
  promptCopy: { marginTop: -spacing.x1 },
  peopleList: { gap: spacing.x2 },
  optionList: {
    gap: spacing.x2,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    paddingHorizontal: spacing.x4,
    paddingVertical: spacing.x4,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  optionRowPressed: { opacity: 0.72 },
  optionRowDisabled: { opacity: 0.45 },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCopy: { flex: 1, gap: 2 },
  optionTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.extrabold, fontWeight: '800' },
  optionSubtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  block: {
    gap: spacing.x3,
    padding: spacing.x5,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  blockTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.extrabold, fontWeight: '800' },
  label: { color: colors.muted, fontSize: 11, fontFamily: fonts.extrabold, fontWeight: '800', textTransform: 'uppercase' },
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
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  addedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.large,
    backgroundColor: '#EAF6E4',
    borderWidth: 1,
    borderColor: '#CFE8C0',
  },
  addedCopy: { flex: 1, gap: 2 },
  addedTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.extrabold, fontWeight: '800' },
  addedMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  addedBadge: {
    marginTop: 4,
    color: colors.ink,
    fontSize: 11,
    fontFamily: fonts.extrabold, fontWeight: '800',
    textTransform: 'uppercase',
  },
  addedActions: { flexDirection: 'row', gap: spacing.x2 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#CFE8C0',
  },
  qrSheetCopy: { textAlign: 'center' },
  qrWrap: {
    alignItems: 'center',
    gap: spacing.x2,
    padding: spacing.x5,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
  },
  qrHint: { color: colors.ink, fontSize: 16, fontFamily: fonts.extrabold, fontWeight: '800', textAlign: 'center' },
  qrSubhint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },
  exchangeList: { gap: spacing.x3 },
  exchangeCard: {
    gap: spacing.x1,
    padding: spacing.x4,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  exchangeCardSelected: {
    borderColor: colors.ink,
    backgroundColor: colors.surfaceMuted,
  },
  exchangeCardDisabled: { opacity: 0.55 },
  exchangeName: { color: colors.ink, fontSize: 15, fontFamily: fonts.extrabold, fontWeight: '800' },
  exchangeMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  exchangeSelected: { color: colors.ink, fontSize: 11, fontFamily: fonts.black, fontWeight: '900', textTransform: 'uppercase' },
});
