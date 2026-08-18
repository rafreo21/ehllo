import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import {
  Bell,
  CalendarCheck,
  CheckCircle,
  ClockCounterClockwise,
  HandWaving,
  ShareNetwork,
  UsersThree,
} from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader, ScreenFrame } from '@/components/ui';
import { EmptyState } from '@/components/empty-state';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { CaptureListSkeleton } from '@/components/skeleton';
import { FollowUpAudienceSheet } from '@/components/follow-up-audience-sheet';
import { FollowUpMissingSheet } from '@/components/follow-up-missing-sheet';
import { useAuth } from '@/features/auth/auth-context';
import { fetchFollowUps, type FollowUpItem } from '@/features/follow-ups/follow-up-api';
import { useFollowUpActions } from '@/features/follow-ups/use-follow-up-actions';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationDeepLink,
  type NotificationRecord,
  type NotificationType,
} from '@/features/notifications/notification-center-api';
import { describeError } from '@/lib/friendly-error';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

const FOLLOW_UP_NOTIFICATION_TYPES = new Set<NotificationType>(['follow_up_due', 'follow_up_overdue']);

function formatRelative(iso: string) {
  if (!iso) return '';
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function iconForType(type: NotificationType) {
  switch (type) {
    case 'review_ready': return CheckCircle;
    case 'follow_up_due': return CalendarCheck;
    case 'follow_up_overdue': return ClockCounterClockwise;
    case 'shared_meeting_update': return ShareNetwork;
    case 'connection_added': return UsersThree;
    case 'keep_in_touch': return HandWaving;
    default: return Bell;
  }
}

export default function NotificationCenterScreen() {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorSheetOpen, setErrorSheetOpen] = useState(false);
  const {
    runFollowUp,
    missingOpen,
    missingExecution,
    missingLoading,
    closeMissing,
    requestMissingField,
    draftRequestEmail,
    audienceOpen,
    audienceItem,
    audienceParticipants,
    confirmAudience,
    closeAudience,
  } = useFollowUpActions(session?.access_token, { allFollowUps: followUps });

  const load = useCallback(async () => {
    if (!session?.access_token) {
      setNotifications([]);
      setFollowUps([]);
      setLoading(false);
      return;
    }
    try {
      const [notificationsResult, followUpsResult] = await Promise.allSettled([
        fetchNotifications(session.access_token),
        fetchFollowUps(session.access_token),
      ]);
      if (notificationsResult.status === 'fulfilled') setNotifications(notificationsResult.value.notifications);
      else throw notificationsResult.reason;
      if (followUpsResult.status === 'fulfilled') setFollowUps(followUpsResult.value);
    } catch (caught) {
      setErrorMessage(describeError(caught, 'Could not load your notifications.'));
      setErrorSheetOpen(true);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function openNotification(notification: NotificationRecord) {
    if (!session?.access_token) return;
    if (!notification.readAt) {
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item
      )));
      void markNotificationRead(session.access_token, notification.id).catch(() => undefined);
    }

    if (FOLLOW_UP_NOTIFICATION_TYPES.has(notification.type) && notification.encounterId) {
      const matchingItem = followUps.find((item) => (
        item.encounterId === notification.encounterId && item.actionId === notification.actionId
      ));
      if (matchingItem) {
        runFollowUp(matchingItem);
        return;
      }
    }

    const destination = notificationDeepLink(notification);
    if (destination) router.push(destination as never);
  }

  async function markAllRead() {
    if (!session?.access_token || refreshingAll) return;
    setRefreshingAll(true);
    const now = new Date().toISOString();
    setNotifications((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: now })));
    try {
      await markAllNotificationsRead(session.access_token);
      await Notifications.setBadgeCountAsync(0).catch(() => false);
    } catch (caught) {
      setErrorMessage(describeError(caught, 'Could not update your notifications.'));
      setErrorSheetOpen(true);
      void load();
    } finally {
      setRefreshingAll(false);
    }
  }

  const unreadCount = notifications.filter((item) => !item.readAt).length;

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  return (
    <ScreenFrame>
      <PageHeader
        title="Notifications"
        onBack={goBack}
        rightAction={unreadCount ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all as read"
            hitSlop={4}
            onPress={() => void markAllRead()}
            style={({ pressed }) => [styles.markAllButton, pressed && styles.markAllButtonPressed]}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        ) : undefined}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? <CaptureListSkeleton count={4} /> : null}

        {!loading && notifications.length === 0 ? (
          <EmptyState
            illustration={require('@/assets/animations/share.json')}
            title="Nothing yet"
            copy="You'll see review-ready captures, due follow-ups, and shared-meeting updates here."
            bordered
          />
        ) : null}

        {notifications.map((notification) => {
          const Icon = iconForType(notification.type);
          const unread = !notification.readAt;
          return (
            <Pressable
              key={notification.id}
              accessibilityRole="button"
              onPress={() => void openNotification(notification)}
              style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.rowPressed]}>
              <View style={[styles.iconWrap, unread && styles.iconWrapUnread]}>
                <Icon size={18} color={unread ? colors.white : colors.ink} weight="bold" />
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]}>{notification.title}</Text>
                {notification.body ? <Text style={styles.rowBody} numberOfLines={2}>{notification.body}</Text> : null}
                <Text style={styles.rowWhen}>{formatRelative(notification.createdAt)}</Text>
              </View>
              {unread ? <View style={styles.unreadDot} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <OutcomeErrorSheet
        visible={errorSheetOpen}
        message={errorMessage}
        onClose={() => {
          setErrorSheetOpen(false);
          setErrorMessage('');
        }}
      />

      <FollowUpMissingSheet
        visible={missingOpen}
        execution={missingExecution}
        loading={missingLoading}
        onClose={closeMissing}
        onRequest={() => void requestMissingField()}
        onDraftEmail={() => void draftRequestEmail()}
      />

      <FollowUpAudienceSheet
        visible={audienceOpen}
        item={audienceItem}
        participants={audienceParticipants}
        onClose={closeAudience}
        onConfirm={confirmAudience}
      />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.x2,
    paddingBottom: spacing.x6,
    gap: spacing.x2,
  },
  markAllButton: {
    height: 42,
    paddingHorizontal: spacing.x4,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  markAllButtonPressed: { backgroundColor: colors.surfaceMuted },
  markAllText: { color: colors.ink, fontSize: 12, fontFamily: fonts.bold, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowUnread: { backgroundColor: colors.surfaceMuted },
  rowPressed: { opacity: 0.9 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  iconWrapUnread: { backgroundColor: colors.ink },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.medium, fontWeight: '700' },
  rowTitleUnread: { fontFamily: fonts.extrabold, fontWeight: '900' },
  rowBody: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  rowWhen: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, fontWeight: '700', marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: radius.round, backgroundColor: colors.accent, marginTop: 6 },
});
