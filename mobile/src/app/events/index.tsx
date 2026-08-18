import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { ArrowsClockwise, CalendarBlank, CaretRight, LinkSimple, NotePencil, Plus, WarningCircle } from 'phosphor-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { EventCalendarConflictSheet } from '@/components/event-calendar-conflict-sheet';
import { EmptyState } from '@/components/empty-state';
import { EventCard } from '@/components/event-card';
import { EventInviteSheet } from '@/components/event-invite-sheet';
import { OfflineBanner } from '@/components/offline-banner';
import { EventManageSheet } from '@/components/event-manage-sheet';
import { EventPastSheet } from '@/components/event-past-sheet';
import { MiniPromptCard } from '@/components/mini-prompt-card';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { OutcomeSuccessSheet } from '@/components/outcome-success-sheet';
import { SettingsSkeleton } from '@/components/skeleton';
import { Button, ChoicePill, HeaderActionButton, PageHeader, Screen, ToggleRow } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { fetchAddressSuggestions, type AddressSuggestion } from '@/features/events/address-autocomplete';
import {
  canCheckInToEvent,
  compareEventsByStart,
  groupEventsForList,
  isEventCurrentlyHappening,
  isUpcomingEvent,
} from '@/features/events/event-home-state';
import {
  createEvent,
  resolveEventCalendarConflict,
  extractEventFromLink,
  fetchEventCandidates,
  fetchEventInvitations,
  fetchMyEvents,
  markEventLeft,
  inviteEventGuest,
  removeEventFromMyList,
  revokeEventInvitation,
  setEventAttendance,
  setEventCheckIn,
  updateEvent,
  EventUpdateConflictError,
  type CalendarProviderStatus,
  type EventItem,
  type EventInvitation,
} from '@/features/events/events-api';
import { applyEventDateChange, resolveExtractedEventDates } from '@/features/events/event-form-state';
import { cacheEventAttendance, cacheEventCheckIn, cacheEventLeftAt } from '@/features/events/event-cache';
import { calendarProviderName, calendarPushProvider, fetchConnectedAccounts } from '@/features/integrations/integrations-api';
import { readEnv } from '@/lib/env';
import { isOnline } from '@/lib/connectivity';
import { describeError } from '@/lib/friendly-error';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

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

type EventFilterKey = 'upcoming' | 'attended' | 'notGoing' | 'didNotAttend' | 'cancelled';

// Each filter explains its own emptiness. A shared "nothing here" would be
// technically true and useless - not having declined anything is a different
// situation from not having attended anything yet.
const emptyFilterCopy: Record<EventFilterKey, { title: string; copy: string }> = {
  upcoming: { title: 'Nothing coming up', copy: 'Add an event, or connect your calendar in Settings.' },
  attended: { title: 'No events attended yet', copy: 'Events you went to show up here once they have finished.' },
  notGoing: { title: 'Nothing declined', copy: "Events you say you're not going to stay here in case you change your mind." },
  didNotAttend: { title: 'Nothing missed', copy: 'Events you declined appear here after they have finished.' },
  cancelled: { title: 'Nothing cancelled', copy: 'Events cancelled by you or the organiser appear here.' },
};

export default function EventsScreen() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const [events, setEvents] = useState<EventItem[]>([]);
  const [candidates, setCandidates] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Separate from `loading`, which only ever gates the first-load skeleton -
  // this drives the header refresh icon's spin without re-blanking the screen
  // on every focus/manual refresh (same flash `loading` caused on Home before
  // it got its own hasLoadedOnce guard).
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const [refreshTitle, setRefreshTitle] = useState('Events updated');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<{ title: string; location: string } | null>(null);
  const [calendarProvider, setCalendarProvider] = useState<'google' | 'microsoft' | null>(null);
  const [conflictEvent, setConflictEvent] = useState<EventItem | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const [pastSheetEvent, setPastSheetEvent] = useState<EventItem | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [providerStatus, setProviderStatus] = useState<{ google: CalendarProviderStatus; microsoft: CalendarProviderStatus }>({
    google: 'not_connected',
    microsoft: 'not_connected',
  });
  const [syncedAt, setSyncedAt] = useState('');
  const [activeFilter, setActiveFilter] = useState<EventFilterKey>('upcoming');
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
    // flaky Google Calendar call never blocks the rest of the screen - but
    // for a manual refresh the user explicitly asked to be told, so track it
    // separately instead of letting it disappear silently like it used to.
    let candidateSyncFailed = false;
    try {
      const [mine, candidatesResult, accounts] = await Promise.all([
        fetchMyEvents(accessToken, { allowCacheFallback: !isOnline(), include: 'all' }),
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
            ? `Synced with your calendar. ${suggested.length} suggestion${suggested.length === 1 ? '' : 's'} found.`
            : "Synced with your calendar. You're all caught up.");
        }
      }
    } catch (caught) {
      setError(options?.manual
        ? 'Could not refresh your events. Check your connection and try again.'
        : describeError(caught, 'Could not load your events.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  // Calendar candidates come from a live Google Calendar fetch on every call
  // (see syncCalendarCandidates) - there's no push/webhook, so re-syncing
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

  const { upcoming, past } = groupEventsForList(events);
  // Named groups rather than one undifferentiated pile: a declined event that
  // has not happened yet is a different thing from one that has, and only the
  // first can be reversed. Empty groups render nothing at all.
  const upcomingCandidates = candidates
    .filter((event) => isUpcomingEvent(event))
    .sort(compareEventsByStart);

  // One pill per state rather than two tabs plus in-page headings: the
  // headings were doing the work of a filter without being tappable, and
  // "Past" had to hold three unrelated things. Upcoming keeps confirmed
  // events and undecided suggestions together because both are answers to
  // "what is ahead of me".
  const eventFilters = [
    { key: 'upcoming' as const, label: 'Upcoming', events: upcoming, count: upcoming.length + upcomingCandidates.length },
    { key: 'attended' as const, label: 'Attended', events: past.attended, count: past.attended.length },
    { key: 'notGoing' as const, label: 'Not going', events: past.notGoing, count: past.notGoing.length },
    { key: 'didNotAttend' as const, label: "Didn't attend", events: past.didNotAttend, count: past.didNotAttend.length },
    { key: 'cancelled' as const, label: 'Cancelled', events: past.cancelled, count: past.cancelled.length },
  ];
  const activeEvents = eventFilters.find((filter) => filter.key === activeFilter)?.events ?? [];

  async function decide(event: EventItem, status: 'going' | 'not_going') {
    if (!accessToken) return;
    setBusyId(event.id);
    setError('');
    try {
      await setEventAttendance(accessToken, event.id, status);
      await cacheEventAttendance(event, status);
      setCandidates((current) => current.filter((item) => item.id !== event.id));
      // Both answers keep the event on the list; only its attendanceStatus
      // differs. Dropping the row on "not going" is what previously erased the
      // decision and left nothing to reverse.
      const decided = { ...event, attendanceStatus: status };
      setEvents((current) => (
        current.some((item) => item.id === event.id)
          ? current.map((item) => (item.id === event.id ? { ...item, attendanceStatus: status } : item))
          : [...current, decided]
      ));
      if (isOnline()) await refresh();
    } catch (caught) {
      setError(describeError(caught, 'Could not update this event.'));
    } finally {
      setBusyId('');
    }
  }

  async function rejoinEvent(event: EventItem) {
    setPastSheetEvent(null);
    await decide(event, 'going');
    setActiveFilter('upcoming');
  }

  function recreateEvent(event: EventItem) {
    // Title and location carry over; the dates deliberately do not. Reusing a
    // finished event's date would rewrite history that captures and follow-ups
    // are already attached to, so this always creates a new record.
    setPastSheetEvent(null);
    setAddPrefill({ title: event.title, location: event.location });
    setAddOpen(true);
  }

  async function removeEvent(event: EventItem) {
    if (!accessToken) return;
    setPastSheetEvent(null);
    setBusyId(event.id);
    setError('');
    try {
      await removeEventFromMyList(accessToken, event.id);
      setEvents((current) => current.filter((item) => item.id !== event.id));
      if (isOnline()) await refresh();
    } catch (caught) {
      setError(describeError(caught, 'Could not remove this event.'));
    } finally {
      setBusyId('');
    }
  }

  async function checkInToEvent(event: EventItem) {
    if (!accessToken) return;
    setBusyId(event.id);
    setError('');
    const checkedInAt = new Date().toISOString();
    try {
      // Update locally first. Checking in happens at the door of a venue,
      // which is exactly where reception is worst, and the point of the whole
      // feature is that scans made there file correctly - so the local answer
      // must be right immediately, whether or not the write lands now.
      await cacheEventCheckIn(event.id, checkedInAt);
      setEvents((current) => current.map((item) => (
        item.id === event.id
          ? { ...item, checkedInAt, leftAt: null }
          : item.checkedInAt ? { ...item, checkedInAt: null } : item
      )));
      await setEventCheckIn(accessToken, event.id, true);
      if (isOnline()) await refresh();
    } catch (caught) {
      setError(describeError(caught, 'Could not update where you are.'));
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
      setError(describeError(caught, 'Could not update this event.'));
    } finally {
      setBusyId('');
    }
  }

  // Best-effort. A failure here means the toggle is offered as unavailable,
  // which is the safe direction: the server re-checks health before queuing
  // anything, so a false negative costs an opt-in, not a lost event.
  useEffect(() => {
    if (!accessToken) {
      setCalendarProvider(null);
      return;
    }
    let cancelled = false;
    fetchConnectedAccounts(accessToken)
      .then((status) => {
        if (!cancelled) setCalendarProvider(calendarPushProvider(status));
      })
      .catch(() => {
        if (!cancelled) setCalendarProvider(null);
      });
    return () => { cancelled = true; };
  }, [accessToken]);

  async function keepMyVersion() {
    if (!accessToken || !conflictEvent) return;
    setResolvingConflict(true);
    setError('');
    try {
      await resolveEventCalendarConflict(accessToken, conflictEvent.id);
      setConflictEvent(null);
      setRefreshTitle('Calendar will be updated');
      setRefreshMessage('Your version is queued and the calendar will match it shortly.');
      if (isOnline()) await refresh();
    } catch (caught) {
      setError(describeError(caught, 'Could not update the calendar.'));
    } finally {
      setResolvingConflict(false);
    }
  }

  async function addEvent(input: { title: string; location: string; startsAt: string; endsAt: string; sourceUrl: string; addToCalendar: boolean }) {
    if (!accessToken) return;
    const created = await createEvent(accessToken, {
      title: input.title,
      location: input.location || undefined,
      startsAt: input.startsAt,
      endsAt: input.endsAt || undefined,
      sourceUrl: input.sourceUrl || undefined,
      addToCalendar: input.addToCalendar,
    });
    setCandidates((current) => [...current, created]);
    setActiveFilter(isUpcomingEvent(created) ? 'upcoming' : 'attended');
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
      setInviteError(describeError(caught, 'Could not invite this guest.'));
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
      setInviteError(describeError(caught, 'Could not load this event’s invitations.'));
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
              .catch((caught) => setInviteError(describeError(caught, 'Could not revoke this invitation.')))
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
      setManageError(describeError(caught, 'Could not update this event.'));
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
      setManageError(describeError(caught, 'Could not cancel this event.'));
    } finally {
      setManageLoading(false);
    }
  }

  const header = (
    <View style={styles.fixedHeader}>
      <PageHeader
        eyebrow="My events"
        title="Events"
        description="Captures made here keep their event context."
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          keyboardShouldPersistTaps="handled">
          {eventFilters.map((filter) => (
            <ChoicePill
              key={filter.key}
              label={filter.count ? `${filter.label} ${filter.count}` : filter.label}
              accessibilityLabel={`${filter.label}, ${filter.count} event${filter.count === 1 ? '' : 's'}`}
              selected={activeFilter === filter.key}
              onPress={() => setActiveFilter(filter.key)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <Screen header={header}>
      <OfflineBanner message="Offline. Showing your saved events. New changes will sync once you're back online." />
      {loading ? <SettingsSkeleton /> : null}

      {!loading && !accessToken ? (
        <EmptyState
          illustration={require('@/assets/animations/no-events.json')}
          title="Sign in to see events"
          copy="Confirm where you're going, and captures made there will keep the event context."
          primaryLabel="Sign in"
          onPrimary={() => router.push('/auth')}
        />
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

          {activeFilter === 'upcoming' ? (
            upcomingCandidates.length || upcoming.length ? (
              <>
                {upcoming.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    variant={isEventCurrentlyHappening(event) ? 'current' : 'going'}
                    busy={busyId === event.id}
                    onNotGoing={(item) => void decide(item, 'not_going')}
                    onLeave={isEventCurrentlyHappening(event) ? (item) => void leaveEvent(item) : undefined}
                    onCheckIn={canCheckInToEvent(event) ? (item) => void checkInToEvent(item) : undefined}
                    onInvite={(item) => void openInvitations(item)}
                    onManage={event.source !== 'calendar' ? (item) => { setManageError(''); setManageEvent(item); } : undefined}
                    onResolveConflict={(item) => setConflictEvent(item)}
                  />
                ))}
                {upcomingCandidates.length ? (
                  <View style={styles.eventGroup}>
                    {/* No heading: a suggestion card already shows Going /
                        Not going, so naming the group only restated the
                        buttons and crowded the top of the list. */}
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
              <EmptyState
                illustration={require('@/assets/animations/no-events.json')}
                title="Nothing coming up"
                copy={calendarConnected
                  ? 'Add an event, or wait for your calendar to sync a suggestion.'
                  : 'Add an event, or connect your calendar in Settings.'}
              />
            )
          ) : activeEvents.length ? (
            activeEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                variant="past"
                busy={busyId === event.id}
                onPress={() => setPastSheetEvent(event)}
                onResolveConflict={(item) => setConflictEvent(item)}
              />
            ))
          ) : (
            <EmptyState
              illustration={require('@/assets/animations/no-events.json')}
              title={emptyFilterCopy[activeFilter].title}
              copy={emptyFilterCopy[activeFilter].copy}
            />
          )}
        </View>
      ) : null}

      <AddEventSheet
        visible={addOpen}
        prefill={addPrefill}
        onClose={() => { setAddOpen(false); setAddPrefill(null); }}
        onSubmit={addEvent}
        accessToken={accessToken}
        calendarProvider={calendarProvider}
      />
      <EventCalendarConflictSheet
        visible={Boolean(conflictEvent)}
        event={conflictEvent}
        loading={resolvingConflict}
        onKeepMine={() => void keepMyVersion()}
        onClose={() => setConflictEvent(null)}
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
      <EventPastSheet
        event={pastSheetEvent}
        busy={Boolean(pastSheetEvent) && busyId === pastSheetEvent?.id}
        onClose={() => setPastSheetEvent(null)}
        onRejoin={(event) => void rejoinEvent(event)}
        onRecreate={recreateEvent}
        onRemove={(event) => void removeEvent(event)}
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
        // This sheet is reused for every event outcome (sync, add, invite,
        // update, cancel) - all of them are event-themed, so they share this
        // illustration rather than falling through to the generic default.
        lottieSource={require('@/assets/animations/event-synced.json')}
        onClose={() => setRefreshMessage('')}
      />
    </Screen>
  );
}

type AddEventForm = { title: string; location: string; start: Date | null; end: Date | null; sourceUrl: string };

function defaultForm(): AddEventForm {
  return { title: '', location: '', start: null, end: null, sourceUrl: '' };
}

// Seed value for opening a picker on a field that has no date yet - the
// next round hour, matching what "Starts" used to default the whole form to.
function nextHourDefault(): Date {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

// choose: the two big entry options. link: paste + Continue. link-loading:
// reading the page. form: the field editor, reached blank (manual) or
// prefilled (after a successful link read) - see cameFromLink for copy.
type AddEventStep = 'choose' | 'link' | 'link-loading' | 'form';

function AddEventSheet({
  visible,
  prefill,
  onClose,
  onSubmit,
  accessToken,
  calendarProvider,
}: {
  visible: boolean;
  /** Recreating a finished event: name and place carry over, dates never do. */
  prefill?: { title: string; location: string } | null;
  onClose: () => void;
  onSubmit: (input: { title: string; location: string; startsAt: string; endsAt: string; sourceUrl: string; addToCalendar: boolean }) => Promise<void>;
  accessToken: string | null;
  /** The calendar this event could be pushed to, or null when none is usable. */
  calendarProvider: 'google' | 'microsoft' | null;
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
  // Defaults on when a calendar is connected and healthy, off when there is
  // nothing to push to. Re-derived when the sheet opens so connecting an account
  // and coming straight back does not leave a stale off state.
  const [addToCalendar, setAddToCalendar] = useState(Boolean(calendarProvider));

  useEffect(() => {
    if (!visible) return;
    // Deferred a microtask so this lands after the render that opened the sheet
    // rather than during it (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => setAddToCalendar(Boolean(calendarProvider)));
  }, [visible, calendarProvider]);

  useEffect(() => {
    if (visible) {
      void Promise.resolve().then(() => {
        setStep(prefill ? 'form' : 'choose');
        setCameFromLink(false);
        setForm(prefill ? { ...defaultForm(), title: prefill.title, location: prefill.location } : defaultForm());
        setLinkUrl('');
        setError('');
        setDateNotice('');
        setDateNeedsReview(false);
      });
    }
  }, [visible, prefill]);

  // Seamless paste: the moment the link step opens with a URL already on
  // the clipboard (the common case - just copied from a browser or invite),
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
      ?? (field === 'end' && form.start ? new Date(form.start.getTime() + 60 * 60 * 1000) : nextHourDefault());
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
      const dates = resolveExtractedEventDates(extracted);
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
      setError(describeError(caught, 'Could not read that link.'));
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
    if (!form.start) {
      setError('Choose the event’s start date and time.');
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
      
      addToCalendar: addToCalendar && Boolean(calendarProvider),
    });
    } catch (caught) {
      setError(describeError(caught, 'Could not save this event.'));
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
            onPress={() => setStep('form')}
            style={styles.chooseOption}>
            <View style={styles.chooseIcon}><NotePencil size={20} color={colors.ink} weight="bold" /></View>
            <View style={styles.chooseCopy}>
              <Text style={styles.chooseTitle}>Enter details</Text>
              <Text style={styles.chooseHint}>Enter the name, location, and time yourself.</Text>
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
          <ToggleRow
            label={`Add to ${calendarProviderName(calendarProvider)}`}
            hint={calendarProvider
              ? 'Edits and cancellations here will follow it across.'
              : 'Connect a calendar in Settings to turn this on.'}
            value={addToCalendar && Boolean(calendarProvider)}
            onChange={setAddToCalendar}
            disabled={!calendarProvider}
            icon={<CalendarBlank size={18} color={calendarProvider ? colors.ink : colors.muted} weight="bold" />}
          />

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
              <Text style={styles.dateButtonText}>
                {form.start ? formatEventWhen({ startsAt: form.start.toISOString() }) : 'Not set'}
              </Text>
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
            value={(iosPicker === 'start' ? form.start : form.end)
              ?? (iosPicker === 'end' && form.start ? new Date(form.start.getTime() + 60 * 60 * 1000) : nextHourDefault())}
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
 * configured (readEnv().googlePlacesApiKey empty) - the field must stay
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
  section: { gap: spacing.x4 },
  eventGroup: { gap: spacing.x2 },
  pastGroup: {
    gap: spacing.x2,
  },
  pastGroupTitle: {
    color: colors.ink,
    fontSize: 15,
    fontFamily: fonts.medium, fontWeight: '700',
  },
  pastGroupCaption: {
    color: colors.muted,
    fontSize: 13,
    marginTop: -spacing.x1,
  },
  filterRow: { flexDirection: 'row', gap: spacing.x2, paddingVertical: spacing.x1, paddingRight: spacing.x4 },
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
  chooseTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  chooseHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', gap: spacing.x3, paddingVertical: spacing.x6 },
  loadingText: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium, fontWeight: '700' },
  form: { gap: spacing.x4 },
  linkStatusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  linkStatusText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  fieldGroup: { gap: spacing.x2 },
  label: { color: colors.muted, fontSize: 11, fontFamily: fonts.bold, fontWeight: '800' },
  input: { fontFamily: fonts.regular,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x3,
    color: colors.ink,
    fontSize: 15,
    backgroundColor: colors.surface, },
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
  suggestionText: { color: colors.ink, fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600' },
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
  dateButtonText: { color: colors.ink, fontSize: 14, fontFamily: fonts.medium, fontWeight: '700' },
  errorText: { color: colors.danger, fontFamily: fonts.regular, fontSize: 13 },
  dateNotice: { color: colors.warning, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
