import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { ArrowsClockwise, CalendarBlank, CaretRight, LinkSimple, NotePencil, Plus, WarningCircle } from 'phosphor-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { EventCard } from '@/components/event-card';
import { EventInviteSheet } from '@/components/event-invite-sheet';
import { EventManageSheet } from '@/components/event-manage-sheet';
import { MiniPromptCard } from '@/components/mini-prompt-card';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { OutcomeSuccessSheet } from '@/components/outcome-success-sheet';
import { SettingsSkeleton } from '@/components/skeleton';
import { Button, HeaderActionButton, PageHeader, Panel, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { fetchAddressSuggestions, type AddressSuggestion } from '@/features/events/address-autocomplete';
import {
  bucketEvents,
  compareEventsByStart,
  isEventCurrentlyHappening,
  isUpcomingEvent,
} from '@/features/events/event-home-state';
import {
  createEvent,
  extractEventFromLink,
  fetchEventCandidates,
  fetchEventInvitations,
  fetchMyEvents,
  markEventLeft,
  inviteEventGuest,
  revokeEventInvitation,
  setEventAttendance,
  updateEvent,
  EventUpdateConflictError,
  type CalendarProviderStatus,
  type EventItem,
  type EventInvitation,
} from '@/features/events/events-api';
import { applyEventDateChange, resolveExtractedEventDates } from '@/features/events/event-form-state';
import { cacheEventAttendance, cacheEventLeftAt } from '@/features/events/event-cache';
import { fetchConnectedAccounts } from '@/features/integrations/integrations-api';
import { readEnv } from '@/lib/env';
import { isOnline } from '@/lib/connectivity';
import { colors, radius, spacing } from '@/theme/tokens';

function formatSyncedAgo(syncedAt: string, now: Date): string {
  const synced = new Date(syncedAt);
  if (Number.isNaN(synced.getTime())) return '';
  const seconds = Math.max(0, Math.round((now.getTime() - synced.getTime()) / 1000));
  if (seconds < 10) return 'Synced just now';
  if (seconds < 60) return `Synced ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `Synced ${hours}h ago`;
}

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
  // Separate from `loading`, which only ever gates the first-load skeleton —
  // this drives the header refresh icon's spin without re-blanking the screen
  // on every focus/manual refresh (same flash `loading` caused on Home before
  // it got its own hasLoadedOnce guard).
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const [refreshTitle, setRefreshTitle] = useState('Events updated');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [providerStatus, setProviderStatus] = useState<{ google: CalendarProviderStatus; microsoft: CalendarProviderStatus }>({
    google: 'not_connected',
    microsoft: 'not_connected',
  });
  const [syncedAt, setSyncedAt] = useState('');
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [inviteEvent, setInviteEvent] = useState<EventItem | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [invitations, setInvitations] = useState<EventInvitation[]>([]);
  const [revokingInvitationId, setRevokingInvitationId] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [manageEvent, setManageEvent] = useState<EventItem | null>(null);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState('');

  const refresh = useCallback(async (options?: { manual?: boolean }) => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setRefreshing(true);
    if (options?.manual) setError('');
    // fetchEventCandidates swallows its own per-provider errors below so a
    // flaky Google Calendar call never blocks the rest of the screen — but
    // for a manual refresh the user explicitly asked to be told, so track it
    // separately instead of letting it disappear silently like it used to.
    let candidateSyncFailed = false;
    try {
      const [mine, candidatesResult, accounts] = await Promise.all([
        fetchMyEvents(accessToken, { allowCacheFallback: !isOnline() }),
        fetchEventCandidates(accessToken).catch(() => {
          candidateSyncFailed = true;
          return null;
        }),
        fetchConnectedAccounts(accessToken).catch(() => null),
      ]);
      setEvents(mine);
      if (accounts) setCalendarConnected(accounts.google.capabilities.calendar || accounts.microsoft.capabilities.calendar);

      const suggested = candidatesResult?.candidates ?? [];
      if (candidatesResult) {
        setCandidates(candidatesResult.candidates);
        setProviderStatus(candidatesResult.providerStatus);
      }

      // This timestamp means both the user's events and suggestions were
      // refreshed on this device. Never stamp a stale cache as freshly synced.
      if (!candidateSyncFailed) setSyncedAt(new Date().toISOString());

      if (options?.manual) {
        if (candidateSyncFailed) {
          setError('Could not reach your calendar. Check your connection and try again.');
        } else {
          setRefreshTitle('Events synced');
          setRefreshMessage(suggested.length
            ? `Synced with your calendar — ${suggested.length} suggestion${suggested.length === 1 ? '' : 's'} found.`
            : "Synced with your calendar — you're all caught up.");
        }
      }
    } catch (caught) {
      // fetchMyEvents isn't wrapped like candidates above, so a total outage
      // lands here — raw fetch/DNS errors ("UnknownHostException…") aren't
      // fit to show, so a manual refresh always gets the friendly copy.
      setError(options?.manual
        ? 'Could not refresh your events. Check your connection and try again.'
        : caught instanceof Error ? caught.message : 'Could not load your events.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  // Calendar candidates come from a live Google Calendar fetch on every call
  // (see syncCalendarCandidates) — there's no push/webhook, so re-syncing
  // every time this screen regains focus is what actually surfaces a newly
  // created calendar event, not just the one-time mount fetch this replaced.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Ticks the "Synced Xm ago" caption forward without needing a new fetch.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const needsReconnectProvider = providerStatus.google === 'needs_reconnect'
    ? 'Google'
    : providerStatus.microsoft === 'needs_reconnect'
      ? 'Microsoft'
      : null;

  const { upcoming, past } = bucketEvents(events);
  const upcomingCandidates = candidates
    .filter((event) => isUpcomingEvent(event))
    .sort(compareEventsByStart);

  async function decide(event: EventItem, status: 'going' | 'not_going') {
    if (!accessToken) return;
    setBusyId(event.id);
    setError('');
    try {
      await setEventAttendance(accessToken, event.id, status);
      await cacheEventAttendance(event, status);
      setCandidates((current) => current.filter((item) => item.id !== event.id));
      if (status === 'going') setEvents((current) => current.some((item) => item.id === event.id) ? current : [...current, event]);
      else setEvents((current) => current.filter((item) => item.id !== event.id));
      if (isOnline()) await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this event.');
    } finally {
      setBusyId('');
    }
  }

  async function leaveEvent(event: EventItem) {
    if (!accessToken) return;
    setBusyId(event.id);
    setError('');
    try {
      await markEventLeft(accessToken, event.id);
      await cacheEventLeftAt(event.id, new Date().toISOString());
      await refresh();
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
    setCandidates((current) => [...current, created]);
    setActiveTab(isUpcomingEvent(created) ? 'upcoming' : 'past');
    setAddOpen(false);
    setRefreshTitle('Event added');
    setRefreshMessage('Choose Going or Not going on the event card. If you choose Going while the event is happening, I\'ve left will become available.');
    if (isOnline()) await refresh();
  }

  async function sendInvite(email: string) {
    if (!accessToken || !inviteEvent) return;
    setInviteLoading(true);
    setInviteError('');
    try {
      const result = await inviteEventGuest(accessToken, inviteEvent.id, email);
      const updatedInvitations = await fetchEventInvitations(accessToken, inviteEvent.id).catch(() => null);
      if (updatedInvitations) setInvitations(updatedInvitations);
      setRefreshTitle(result.emailSent ? 'Invitation sent' : 'Invitation link ready');
      setRefreshMessage(result.emailSent
        ? `${email} can RSVP without creating an account. Their response will stay with them if they sign up.`
        : result.warning || 'Email could not be sent, so share the invitation link instead.');
      if (!result.emailSent) await Share.share({ message: `${inviteEvent.title}\n${result.guestUrl}`, url: result.guestUrl });
    } catch (caught) {
      setInviteError(caught instanceof Error ? caught.message : 'Could not invite this guest.');
    } finally {
      setInviteLoading(false);
    }
  }

  async function openInvitations(event: EventItem) {
    setInviteEvent(event);
    setInvitations([]);
    setInviteError('');
    if (!accessToken) return;
    setInvitationsLoading(true);
    try {
      setInvitations(await fetchEventInvitations(accessToken, event.id));
    } catch (caught) {
      setInviteError(caught instanceof Error ? caught.message : 'Could not load this event’s invitations.');
    } finally {
      setInvitationsLoading(false);
    }
  }

  function confirmRevoke(invitation: EventInvitation) {
    if (!accessToken || !inviteEvent) return;
    Alert.alert(
      'Revoke invitation?',
      `${invitation.email} will no longer be able to RSVP or claim this event with their invitation link.`,
      [
        { text: 'Keep invitation', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => {
            setRevokingInvitationId(invitation.id);
            setInviteError('');
            void revokeEventInvitation(accessToken, inviteEvent.id, invitation.id)
              .then(() => setInvitations((current) => current.map((item) => (
                item.id === invitation.id ? { ...item, status: 'revoked', updatedAt: new Date().toISOString() } : item
              ))))
              .catch((caught) => setInviteError(caught instanceof Error ? caught.message : 'Could not revoke this invitation.'))
              .finally(() => setRevokingInvitationId(''));
          },
        },
      ],
    );
  }

  async function saveEventChanges(input: { title: string; location: string; startsAt: string; endsAt: string | null }) {
    if (!accessToken || !manageEvent) return;
    setManageLoading(true);
    setManageError('');
    try {
      const result = await updateEvent(accessToken, manageEvent.id, { ...input, expectedUpdatedAt: manageEvent.updatedAt });
      setEvents((current) => current.map((item) => item.id === result.event.id ? result.event : item));
      setManageEvent(null);
      setRefreshTitle('Event updated');
      setRefreshMessage(result.emailsFailed
        ? `The event was updated. ${result.emailsSent} guest notification${result.emailsSent === 1 ? '' : 's'} sent; ${result.emailsFailed} could not be delivered.`
        : `The event was updated${result.emailsSent ? ` and ${result.emailsSent} guest${result.emailsSent === 1 ? '' : 's'} notified` : ''}.`);
    } catch (caught) {
      if (caught instanceof EventUpdateConflictError && caught.latestEvent) {
        setEvents((current) => current.map((item) => item.id === caught.latestEvent!.id ? caught.latestEvent! : item));
        setManageEvent(caught.latestEvent);
      }
      setManageError(caught instanceof Error ? caught.message : 'Could not update this event.');
    } finally {
      setManageLoading(false);
    }
  }

  async function cancelManagedEvent() {
    if (!accessToken || !manageEvent) return;
    setManageLoading(true);
    setManageError('');
    try {
      const result = await updateEvent(accessToken, manageEvent.id, { status: 'cancelled', expectedUpdatedAt: manageEvent.updatedAt });
      setEvents((current) => current.filter((item) => item.id !== manageEvent.id));
      setManageEvent(null);
      setRefreshTitle('Event cancelled');
      setRefreshMessage(result.emailsFailed
        ? `The event was cancelled. ${result.emailsSent} guest notification${result.emailsSent === 1 ? '' : 's'} sent; ${result.emailsFailed} could not be delivered.`
        : `The event was cancelled${result.emailsSent ? ` and ${result.emailsSent} guest${result.emailsSent === 1 ? '' : 's'} notified` : ''}.`);
    } catch (caught) {
      if (caught instanceof EventUpdateConflictError && caught.latestEvent) {
        setEvents((current) => current.map((item) => item.id === caught.latestEvent!.id ? caught.latestEvent! : item));
        setManageEvent(caught.latestEvent);
      }
      setManageError(caught instanceof Error ? caught.message : 'Could not cancel this event.');
    } finally {
      setManageLoading(false);
    }
  }

  const header = (
    <View style={styles.fixedHeader}>
      <PageHeader
        eyebrow="My events"
        title="Events"
        description="Confirm where you're going. Captures and follow-ups made there will keep the event context."
        caption={syncedAt ? formatSyncedAgo(syncedAt, now) : undefined}
        rightAction={accessToken ? (
          <View style={styles.headerActions}>
            <HeaderActionButton accessibilityLabel="Refresh events" onPress={() => void refresh({ manual: true })}>
              {refreshing
                ? <ActivityIndicator size="small" color={colors.ink} />
                : <ArrowsClockwise size={18} color={colors.ink} weight="bold" />}
            </HeaderActionButton>
            <HeaderActionButton accessibilityLabel="Add event" onPress={() => setAddOpen(true)}>
              <Plus size={18} color={colors.ink} weight="bold" />
            </HeaderActionButton>
          </View>
        ) : undefined}
      />
      {!loading && accessToken ? (
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
      ) : null}
    </View>
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

      {!loading && accessToken ? (
        <View style={styles.section}>
          {needsReconnectProvider ? (
            <MiniPromptCard
              icon={<WarningCircle size={18} color={colors.danger} weight="bold" />}
              title={`Reconnect ${needsReconnectProvider} Calendar`}
              copy="Your calendar connection stopped working, so nothing new can sync until you reconnect."
              onPress={() => router.push('/settings/connected-accounts')}
            />
          ) : null}

          {activeTab === 'upcoming' ? (
            upcomingCandidates.length || upcoming.length ? (
              <>
                {upcoming.length ? (
                  <View style={styles.eventGroup}>
                    <Text style={styles.eventGroupTitle}>You’re going</Text>
                    {upcoming.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        variant={isEventCurrentlyHappening(event) ? 'current' : 'going'}
                        busy={busyId === event.id}
                        onNotGoing={(item) => void decide(item, 'not_going')}
                        onLeave={isEventCurrentlyHappening(event) ? (item) => void leaveEvent(item) : undefined}
                        onInvite={(item) => void openInvitations(item)}
                        onManage={event.source !== 'calendar' ? (item) => { setManageError(''); setManageEvent(item); } : undefined}
                      />
                    ))}
                  </View>
                ) : null}
                {upcomingCandidates.length ? (
                  <View style={styles.eventGroup}>
                    <View style={styles.eventGroupHeading}>
                      <Text style={styles.eventGroupTitle}>Needs your response</Text>
                      <Text style={styles.eventGroupCopy}>These are suggestions, not events you have confirmed.</Text>
                    </View>
                    {upcomingCandidates.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        variant="candidate"
                        busy={busyId === event.id}
                        onGoing={(item) => void decide(item, 'going')}
                        onNotGoing={(item) => void decide(item, 'not_going')}
                      />
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <Panel>
                <Text style={styles.panelCopy}>
                  {calendarConnected
                    ? 'Nothing coming up. Add an event, or wait for your calendar to sync a suggestion.'
                    : 'Nothing coming up. Add an event, or connect your calendar in Settings.'}
                </Text>
              </Panel>
            )
          ) : (
            past.length ? past.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                variant="past"
                busy={busyId === event.id}
              />
            )) : (
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
      <EventInviteSheet
        key={inviteEvent?.id ?? 'closed'}
        event={inviteEvent}
        loading={inviteLoading}
        invitationsLoading={invitationsLoading}
        invitations={invitations}
        revokingInvitationId={revokingInvitationId}
        error={inviteError}
        onClose={() => { setInviteEvent(null); setInviteError(''); setInvitations([]); }}
        onInvite={(email) => void sendInvite(email)}
        onRevoke={confirmRevoke}
      />
      <EventManageSheet
        key={manageEvent?.id ?? 'closed-manage'}
        event={manageEvent}
        loading={manageLoading}
        error={manageError}
        onClose={() => { setManageEvent(null); setManageError(''); }}
        onSave={(input) => void saveEventChanges(input)}
        onCancelEvent={() => void cancelManagedEvent()}
      />
      <OutcomeErrorSheet visible={Boolean(error)} message={error} onClose={() => setError('')} />
      <OutcomeSuccessSheet
        visible={Boolean(refreshMessage)}
        title={refreshTitle}
        message={refreshMessage}
        onClose={() => setRefreshMessage('')}
      />
    </Screen>
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
  const [dateNotice, setDateNotice] = useState('');
  const [dateNeedsReview, setDateNeedsReview] = useState(false);
  const [iosPicker, setIosPicker] = useState<'start' | 'end' | null>(null);

  useEffect(() => {
    if (visible) {
      void Promise.resolve().then(() => {
        setStep('choose');
        setCameFromLink(false);
        setForm(defaultForm());
        setLinkUrl('');
        setError('');
        setDateNotice('');
        setDateNeedsReview(false);
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
    const current = (field === 'start' ? form.start : form.end)
      ?? new Date(form.start.getTime() + 60 * 60 * 1000);
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
            setForm((prev) => ({ ...prev, ...applyEventDateChange(prev, field, merged) }));
            if (field === 'start') {
              setDateNeedsReview(false);
              setDateNotice('');
            }
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
      const dates = resolveExtractedEventDates(extracted, defaultForm().start);
      setForm({
        title: extracted.title || '',
        location: extracted.location || '',
        start: dates.start,
        end: dates.end,
        sourceUrl: url,
      });
      setDateNeedsReview(dates.needsReview);
      setDateNotice(dates.notice);
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
    if (dateNeedsReview) {
      setError('Choose and confirm the event’s correct start date and time.');
      return;
    }
    if (form.end && form.end.getTime() <= form.start.getTime()) {
      setError('The event end time must be after its start time.');
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
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDateNeedsReview(true);
              setDateNotice('Choose the event’s start date and time before adding it.');
              setStep('form');
            }}
            style={styles.chooseOption}>
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
            {dateNotice ? <Text style={styles.dateNotice}>{dateNotice}</Text> : null}
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
          footer={<Button onPress={() => {
            if (iosPicker === 'start') {
              setDateNeedsReview(false);
              setDateNotice('');
            }
            setIosPicker(null);
          }}>Use this time</Button>}>
          <DateTimePicker
            value={(iosPicker === 'start' ? form.start : form.end) ?? new Date()}
            mode="datetime"
            display="spinner"
            onChange={(_, date) => {
              if (!date || !iosPicker) return;
              setForm((prev) => ({ ...prev, ...applyEventDateChange(prev, iosPicker, date) }));
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
  fixedHeader: { gap: spacing.x2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  panelTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  panelCopy: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  section: { gap: spacing.x4 },
  eventGroup: { gap: spacing.x2 },
  eventGroupHeading: { gap: spacing.x1 },
  eventGroupTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  eventGroupCopy: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.x1,
    padding: spacing.x1,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.x2, borderRadius: radius.medium },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  tabTextActive: { color: colors.ink },
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
  dateNotice: { color: colors.warning, fontSize: 12, lineHeight: 17 },
});
