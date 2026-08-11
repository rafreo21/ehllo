import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Clipboard from 'expo-clipboard';
import { CalendarBlank, CaretRight, CheckCircle, LinkSimple, NotePencil, Plus } from 'phosphor-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { SettingsSkeleton } from '@/components/skeleton';
import { Button, HeaderActionButton, PageHeader, Panel, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { fetchAddressSuggestions, type AddressSuggestion } from '@/features/events/address-autocomplete';
import { bucketEvents } from '@/features/events/event-home-state';
import {
  createEvent,
  extractEventFromLink,
  fetchEventCandidates,
  fetchMyEvents,
  setEventAttendance,
  type EventItem,
} from '@/features/events/events-api';
import { fetchConnectedAccounts } from '@/features/integrations/integrations-api';
import { readEnv } from '@/lib/env';
import { colors, radius, spacing } from '@/theme/tokens';

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/\S+\.\S+/i.test(value.trim());
}

function formatEventWhen(event: Pick<EventItem, 'startsAt'>) {
  const start = new Date(event.startsAt);
  if (Number.isNaN(start.getTime())) return '';
  const datePart = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

export default function EventsScreen() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const [events, setEvents] = useState<EventItem[]>([]);
  const [candidates, setCandidates] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    try {
      const [mine, suggested, accounts] = await Promise.all([
        fetchMyEvents(accessToken),
        fetchEventCandidates(accessToken).catch(() => [] as EventItem[]),
        fetchConnectedAccounts(accessToken).catch(() => null),
      ]);
      setEvents(mine);
      setCandidates(suggested);
      if (accounts) setCalendarConnected(accounts.google.capabilities.calendar || accounts.microsoft.capabilities.calendar);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your events.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const { upcoming, past } = bucketEvents(events);

  async function decide(event: EventItem, status: 'going' | 'not_going') {
    if (!accessToken) return;
    setBusyId(event.id);
    setError('');
    try {
      await setEventAttendance(accessToken, event.id, status);
      setCandidates((current) => current.filter((item) => item.id !== event.id));
      if (status === 'going') setEvents((current) => [...current, event]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this event.');
    } finally {
      setBusyId('');
    }
  }

  async function addEvent(input: { title: string; location: string; startsAt: string; endsAt: string; sourceUrl: string }) {
    if (!accessToken) return;
    const created = await createEvent(accessToken, {
      title: input.title,
      location: input.location || undefined,
      startsAt: input.startsAt,
      endsAt: input.endsAt || undefined,
      sourceUrl: input.sourceUrl || undefined,
    });
    setEvents((current) => [...current, created]);
    setAddOpen(false);
  }

  const header = (
    <PageHeader
      eyebrow="My events"
      title="Events you're going to"
      description="Follow-ups you capture while you're at an event are automatically linked to it."
      rightAction={accessToken ? (
        <HeaderActionButton accessibilityLabel="Add event" onPress={() => setAddOpen(true)}>
          <Plus size={18} color={colors.ink} weight="bold" />
        </HeaderActionButton>
      ) : undefined}
    />
  );

  return (
    <Screen header={header}>
      {loading ? <SettingsSkeleton /> : null}

      {!loading && !accessToken ? (
        <Panel>
          <Text style={styles.panelTitle}>Sign in required</Text>
          <Text style={styles.panelCopy}>Sign in to see your events.</Text>
        </Panel>
      ) : null}

      {!loading && accessToken && candidates.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Suggested from your calendar</Text>
          {candidates.map((event) => (
            <Panel key={event.id} style={styles.card}>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle} numberOfLines={1}>{event.title}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {formatEventWhen(event)}{event.location ? ` · ${event.location}` : ''}
                </Text>
              </View>
              {busyId === event.id ? <ActivityIndicator color={colors.ink} /> : (
                <View style={styles.cardActions}>
                  <Button onPress={() => void decide(event, 'going')}>Going</Button>
                  <Button variant="ghost" onPress={() => void decide(event, 'not_going')}>Not going</Button>
                </View>
              )}
            </Panel>
          ))}
        </View>
      ) : null}

      {!loading && accessToken ? (
        <View style={styles.section}>
          <View style={styles.tabRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: activeTab === 'upcoming' }}
              onPress={() => setActiveTab('upcoming')}
              style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}>
              <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>Upcoming</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: activeTab === 'past' }}
              onPress={() => setActiveTab('past')}
              style={[styles.tab, activeTab === 'past' && styles.tabActive]}>
              <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>Past</Text>
            </Pressable>
          </View>

          {activeTab === 'upcoming' ? (
            upcoming.length ? upcoming.map((event) => <EventRow key={event.id} event={event} />) : (
              <Panel>
                <Text style={styles.panelCopy}>
                  {calendarConnected
                    ? 'Nothing coming up. Add an event, or wait for your calendar to sync a suggestion.'
                    : 'Nothing coming up. Add an event, or connect your calendar in Settings.'}
                </Text>
              </Panel>
            )
          ) : (
            past.length ? past.map((event) => <EventRow key={event.id} event={event} isPast />) : (
              <Panel>
                <Text style={styles.panelCopy}>No past events yet.</Text>
              </Panel>
            )
          )}
        </View>
      ) : null}

      <AddEventSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={addEvent}
        accessToken={accessToken}
      />
      <OutcomeErrorSheet visible={Boolean(error)} message={error} onClose={() => setError('')} />
    </Screen>
  );
}

function EventRow({ event, isPast }: { event: EventItem; isPast?: boolean }) {
  return (
    <Panel style={styles.card}>
      <View style={styles.cardCopy}>
        <Text style={styles.cardTitle} numberOfLines={1}>{event.title}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {formatEventWhen(event)}{event.location ? ` · ${event.location}` : ''}
        </Text>
      </View>
      {isPast ? null : <CheckCircle size={18} color={colors.ink} weight="fill" />}
    </Panel>
  );
}

type AddEventForm = { title: string; location: string; start: Date; end: Date | null; sourceUrl: string };

function defaultForm(): AddEventForm {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return { title: '', location: '', start, end: null, sourceUrl: '' };
}

// choose: the two big entry options. link: paste + Continue. link-loading:
// reading the page. form: the field editor, reached blank (manual) or
// prefilled (after a successful link read) — see cameFromLink for copy.
type AddEventStep = 'choose' | 'link' | 'link-loading' | 'form';

function AddEventSheet({
  visible,
  onClose,
  onSubmit,
  accessToken,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: { title: string; location: string; startsAt: string; endsAt: string; sourceUrl: string }) => Promise<void>;
  accessToken: string | null;
}) {
  const [step, setStep] = useState<AddEventStep>('choose');
  const [cameFromLink, setCameFromLink] = useState(false);
  const [form, setForm] = useState<AddEventForm>(defaultForm);
  const [linkUrl, setLinkUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [iosPicker, setIosPicker] = useState<'start' | 'end' | null>(null);

  useEffect(() => {
    if (visible) {
      void Promise.resolve().then(() => {
        setStep('choose');
        setCameFromLink(false);
        setForm(defaultForm());
        setLinkUrl('');
        setError('');
      });
    }
  }, [visible]);

  // Seamless paste: the moment the link step opens with a URL already on
  // the clipboard (the common case — just copied from a browser or invite),
  // pull it in without making the user paste by hand.
  useEffect(() => {
    if (step !== 'link' || linkUrl.trim()) return;
    void Clipboard.getStringAsync().then((clipboardText) => {
      const trimmed = clipboardText.trim();
      if (looksLikeUrl(trimmed)) setLinkUrl(trimmed);
    }).catch(() => undefined);
  }, [step, linkUrl]);

  function openAndroidPicker(field: 'start' | 'end') {
    const current = (field === 'start' ? form.start : form.end) ?? new Date();
    DateTimePickerAndroid.open({
      value: current,
      mode: 'date',
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          onChange: (timeEvent, time) => {
            if (timeEvent.type !== 'set' || !time) return;
            const merged = new Date(date);
            merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
            setForm((prev) => ({ ...prev, [field]: merged }));
          },
        });
      },
    });
  }

  function openPicker(field: 'start' | 'end') {
    if (Platform.OS === 'android') {
      openAndroidPicker(field);
      return;
    }
    setIosPicker(field);
  }

  async function continueFromLink() {
    const url = linkUrl.trim();
    if (!accessToken || !looksLikeUrl(url)) return;
    setStep('link-loading');
    setError('');
    try {
      const extracted = await extractEventFromLink(accessToken, url);
      setForm({
        title: extracted.title || '',
        location: extracted.location || '',
        start: extracted.startsAt ? new Date(extracted.startsAt) : defaultForm().start,
        end: extracted.endsAt ? new Date(extracted.endsAt) : null,
        sourceUrl: url,
      });
      setCameFromLink(true);
      setStep('form');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that link.');
      setStep('link');
    }
  }

  async function submit() {
    if (!form.title.trim()) {
      setError('Give this event a name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        title: form.title.trim(),
        location: form.location.trim(),
        startsAt: form.start.toISOString(),
        endsAt: form.end ? form.end.toISOString() : '',
        sourceUrl: form.sourceUrl,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this event.');
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    setError('');
    setStep(step === 'form' && cameFromLink ? 'link' : 'choose');
  }

  const titles: Record<AddEventStep, string> = {
    choose: 'Add event',
    link: 'Paste a link',
    'link-loading': 'Paste a link',
    form: cameFromLink ? 'Confirm event' : 'Event details',
  };

  return (
    <BottomSheet
      visible={visible}
      title={titles[step]}
      onClose={onClose}
      onBack={step !== 'choose' ? goBack : undefined}
      footer={
        step === 'link' ? (
          <Button disabled={!looksLikeUrl(linkUrl)} onPress={() => void continueFromLink()}>Continue</Button>
        ) : step === 'form' ? (
          <Button loading={saving} onPress={() => void submit()}>{cameFromLink ? 'Confirm event' : 'Add event'}</Button>
        ) : undefined
      }>

      {step === 'choose' ? (
        <View style={styles.chooseList}>
          <Pressable accessibilityRole="button" onPress={() => setStep('form')} style={styles.chooseOption}>
            <View style={styles.chooseIcon}><NotePencil size={20} color={colors.ink} weight="bold" /></View>
            <View style={styles.chooseCopy}>
              <Text style={styles.chooseTitle}>Enter details</Text>
              <Text style={styles.chooseHint}>Name, location, and time — by hand.</Text>
            </View>
            <CaretRight size={16} color={colors.muted} weight="bold" />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setStep('link')} style={styles.chooseOption}>
            <View style={styles.chooseIcon}><LinkSimple size={20} color={colors.ink} weight="bold" /></View>
            <View style={styles.chooseCopy}>
              <Text style={styles.chooseTitle}>Paste a link</Text>
              <Text style={styles.chooseHint}>We&apos;ll read the event page and fill this in.</Text>
            </View>
            <CaretRight size={16} color={colors.muted} weight="bold" />
          </Pressable>
        </View>
      ) : null}

      {step === 'link' ? (
        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Event link</Text>
            <TextInput
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://…"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
              style={styles.input}
            />
            <Text style={styles.linkStatusText}>Paste a link and we&apos;ll fill in what we can find.</Text>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      ) : null}

      {step === 'link-loading' ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.loadingText}>Getting event details…</Text>
        </View>
      ) : null}

      {step === 'form' ? (
        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Event name</Text>
            <TextInput
              value={form.title}
              onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))}
              placeholder="ProductCon London"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>

          <AddressAutocompleteField
            value={form.location}
            onChange={(value) => setForm((prev) => ({ ...prev, location: value }))}
          />

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Starts</Text>
            <Pressable accessibilityRole="button" onPress={() => openPicker('start')} style={styles.dateButton}>
              <CalendarBlank size={16} color={colors.ink} weight="bold" />
              <Text style={styles.dateButtonText}>{formatEventWhen({ startsAt: form.start.toISOString() })}</Text>
            </Pressable>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Ends (optional)</Text>
            <Pressable accessibilityRole="button" onPress={() => openPicker('end')} style={styles.dateButton}>
              <CalendarBlank size={16} color={colors.ink} weight="bold" />
              <Text style={styles.dateButtonText}>
                {form.end ? formatEventWhen({ startsAt: form.end.toISOString() }) : 'Not set'}
              </Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      ) : null}

      {Platform.OS === 'ios' ? (
        <BottomSheet
          visible={iosPicker !== null}
          title={iosPicker === 'start' ? 'Starts' : 'Ends'}
          onClose={() => setIosPicker(null)}
          footer={<Button onPress={() => setIosPicker(null)}>Use this time</Button>}>
          <DateTimePicker
            value={(iosPicker === 'start' ? form.start : form.end) ?? new Date()}
            mode="datetime"
            display="spinner"
            onChange={(_, date) => {
              if (!date || !iosPicker) return;
              setForm((prev) => ({ ...prev, [iosPicker]: date }));
            }}
          />
        </BottomSheet>
      ) : null}
    </BottomSheet>
  );
}

/**
 * Falls back to a plain text input whenever no Places API key is
 * configured (readEnv().googlePlacesApiKey empty) — the field must stay
 * fully usable before that key ever gets provisioned.
 */
function AddressAutocompleteField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const apiKey = readEnv()?.googlePlacesApiKey ?? '';
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const justSelected = useRef(false);

  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    const trimmed = value.trim();
    const eligible = Boolean(apiKey) && focused && trimmed.length >= 3;

    if (!eligible) {
      const clear = setTimeout(() => setSuggestions([]), 0);
      return () => clearTimeout(clear);
    }

    const searchingFlag = setTimeout(() => setSearching(true), 0);
    const timer = setTimeout(() => {
      void fetchAddressSuggestions(apiKey, trimmed)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      clearTimeout(searchingFlag);
      clearTimeout(timer);
    };
  }, [value, apiKey, focused]);

  function selectSuggestion(suggestion: AddressSuggestion) {
    justSelected.current = true;
    onChange(suggestion.description);
    setSuggestions([]);
  }

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>Location (optional)</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        // Delayed so a suggestion tap's onPress fires before the list unmounts.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={apiKey ? 'Search for a place or address' : 'ExCeL London'}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      {searching ? (
        <View style={styles.linkStatusRow}>
          <ActivityIndicator color={colors.muted} size="small" />
          <Text style={styles.linkStatusText}>Searching…</Text>
        </View>
      ) : null}
      {suggestions.length ? (
        <View style={styles.suggestionList}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.placeId}
              accessibilityRole="button"
              onPress={() => selectSuggestion(suggestion)}
              style={styles.suggestionRow}>
              <Text style={styles.suggestionText} numberOfLines={2}>{suggestion.description}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panelTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  panelCopy: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  section: { gap: spacing.x2, marginTop: spacing.x4 },
  sectionTitle: { color: colors.ink, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.x1,
    padding: spacing.x1,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.x2,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.x2, borderRadius: radius.medium },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  tabTextActive: { color: colors.ink },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3, padding: spacing.x4 },
  cardCopy: { flex: 1, gap: 2 },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  cardMeta: { color: colors.muted, fontSize: 13 },
  cardActions: { gap: spacing.x2 },
  chooseList: { gap: spacing.x2 },
  chooseOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chooseIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  chooseCopy: { flex: 1, gap: 2 },
  chooseTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  chooseHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', gap: spacing.x3, paddingVertical: spacing.x6 },
  loadingText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  form: { gap: spacing.x4 },
  linkStatusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  linkStatusText: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  fieldGroup: { gap: spacing.x2 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x3,
    color: colors.ink,
    fontSize: 15,
    backgroundColor: colors.surface,
  },
  suggestionList: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x3,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  suggestionText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x3,
    backgroundColor: colors.surface,
  },
  dateButtonText: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  errorText: { color: colors.danger, fontSize: 13 },
});
