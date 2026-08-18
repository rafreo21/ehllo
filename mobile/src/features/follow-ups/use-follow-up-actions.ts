import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth/auth-context';
import { useCard } from '@/features/card/card-context';
import type { FollowUpItem } from '@/features/follow-ups/follow-up-api';
import {
  completeFollowUp,
  dismissFollowUp,
  FollowUpConflictError,
  reopenFollowUp,
  snoozeFollowUp,
} from '@/features/follow-ups/follow-up-api';
import { dequeueFollowUpAction, enqueueFollowUpAction, setCachedFollowUpStatus } from '@/features/follow-ups/follow-up-cache';
import {
  applyAudienceToContext,
  contactContextFromCard,
  contactContextFromFollowUp,
  openFollowUpExecution,
  openRequestEmail,
  planFollowUpExecution,
  sendContactFieldRequest,
  type FollowUpExecution,
} from '@/features/follow-ups/follow-up-executor';
import {
  encounterHasMultipleParticipants,
  participantsForEncounter,
  resolveFollowUpUserName,
  type FollowUpAudienceChoice,
} from '@/features/follow-ups/follow-up-participants';
import { fetchConnectedAccounts, type ConnectedAccountStatus } from '@/features/integrations/integrations-api';
import type { MobileCard } from '@/features/card/types';
import type { ConnectionItem } from '@/features/connections/connections-api';
import { isOnline } from '@/lib/connectivity';

function resolveCalendarProvider(status: ConnectedAccountStatus | null): 'google' | 'microsoft' | null {
  if (!status) return null;
  if (status.google.connected) return 'google';
  if (status.microsoft.connected) return 'microsoft';
  return null;
}

type RunFollowUpInput = {
  connection?: ConnectionItem | null;
  card?: MobileCard | null;
};

type UseFollowUpActionsOptions = {
  allFollowUps?: FollowUpItem[];
};

export function useFollowUpActions(
  accessToken?: string | null,
  options: UseFollowUpActionsOptions = {},
) {
  const { allFollowUps = [] } = options;
  const { session } = useAuth();
  const { card, cards } = useCard();
  const userName = useMemo(() => resolveFollowUpUserName({
    activeCardName: card.name,
    cards,
    authName: String(session?.user.user_metadata?.full_name || session?.user.user_metadata?.name || ''),
    authEmail: session?.user.email || '',
  }), [card.name, cards, session?.user.email, session?.user.user_metadata]);
  const [missingExecution, setMissingExecution] = useState<FollowUpExecution | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const [audienceItem, setAudienceItem] = useState<FollowUpItem | null>(null);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [pendingContextInput, setPendingContextInput] = useState<RunFollowUpInput | null>(null);
  const [loading, setLoading] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [calendarProvider, setCalendarProvider] = useState<'google' | 'microsoft' | null>(null);

  useEffect(() => {
    if (!accessToken) {
      void Promise.resolve().then(() => setCalendarProvider(null));
      return;
    }
    void fetchConnectedAccounts(accessToken)
      .then((status) => setCalendarProvider(resolveCalendarProvider(status)))
      .catch(() => setCalendarProvider(null));
  }, [accessToken]);

  const executeFollowUp = useCallback((
    item: FollowUpItem,
    contextInput?: RunFollowUpInput,
    audience?: FollowUpAudienceChoice,
  ) => {
    let context = contextInput?.connection
      ? contactContextFromCard(contextInput.connection, contextInput.card ?? null)
      : contactContextFromFollowUp(item);
    context.encounterTitle = item.encounterTitle;
    context.calendarProvider = calendarProvider;

    if (audience) {
      context = applyAudienceToContext(context, audience, userName);
    } else {
      context.userName = userName;
      context.audienceParticipants = [{
        key: item.personEmail.trim().toLowerCase() || item.personName.trim().toLowerCase() || 'contact',
        name: item.personName,
        email: item.personEmail,
      }];
    }

    const execution = planFollowUpExecution(item, context);

    if (execution.type === 'open') {
      void openFollowUpExecution(execution);
      return;
    }

    setMissingExecution(execution);
    setMissingOpen(true);
  }, [calendarProvider, userName]);

  const runFollowUp = useCallback((
    item: FollowUpItem,
    contextInput?: RunFollowUpInput,
  ) => {
    if (encounterHasMultipleParticipants(allFollowUps, item.encounterId)) {
      setAudienceItem(item);
      setPendingContextInput(contextInput ?? null);
      setAudienceOpen(true);
      return;
    }

    executeFollowUp(item, contextInput);
  }, [allFollowUps, executeFollowUp]);

  const confirmAudience = useCallback((choice: FollowUpAudienceChoice) => {
    if (!audienceItem) return;
    const item = audienceItem;
    const contextInput = pendingContextInput;
    setAudienceOpen(false);
    setAudienceItem(null);
    setPendingContextInput(null);
    executeFollowUp(item, contextInput ?? undefined, choice);
  }, [audienceItem, pendingContextInput, executeFollowUp]);

  const closeAudience = useCallback(() => {
    setAudienceOpen(false);
    setAudienceItem(null);
    setPendingContextInput(null);
  }, []);

  const markComplete = useCallback(async (
    item: FollowUpItem,
    onUpdated?: () => void,
  ) => {
    if (!accessToken) return;
    const key = `${item.encounterId}-${item.actionId}`;
    setCompletingId(key);
    try {
      const completedAt = new Date().toISOString();
      await setCachedFollowUpStatus(item.encounterId, item.actionId, 'completed', {
        completedAt,
        snoozedUntil: undefined,
        dismissedAt: undefined,
        cancelledAt: undefined,
        statusUpdatedAt: completedAt,
      });
      await enqueueFollowUpAction({ encounterId: item.encounterId, actionId: item.actionId, action: 'complete', queuedAt: completedAt, expectedStatusUpdatedAt: item.statusUpdatedAt });
      if (isOnline()) {
        try {
          await completeFollowUp(accessToken, item.encounterId, item.actionId, item.statusUpdatedAt);
          await dequeueFollowUpAction(item.encounterId, item.actionId);
        } catch (error) {
          if (error instanceof FollowUpConflictError) await dequeueFollowUpAction(item.encounterId, item.actionId);
          // Keep queued; retry on the next foreground/reconnect sync - same as card sync failures.
        }
      }
      onUpdated?.();
    } finally {
      setCompletingId(null);
    }
  }, [accessToken]);

  const markOpen = useCallback(async (
    item: FollowUpItem,
    onUpdated?: () => void,
  ) => {
    if (!accessToken) return;
    const key = `${item.encounterId}-${item.actionId}`;
    setCompletingId(key);
    try {
      const queuedAt = new Date().toISOString();
      await setCachedFollowUpStatus(item.encounterId, item.actionId, 'open', {
        completedAt: undefined,
        snoozedUntil: undefined,
        dismissedAt: undefined,
        cancelledAt: undefined,
        statusUpdatedAt: queuedAt,
      });
      await enqueueFollowUpAction({ encounterId: item.encounterId, actionId: item.actionId, action: 'reopen', queuedAt, expectedStatusUpdatedAt: item.statusUpdatedAt });
      if (isOnline()) {
        try {
          await reopenFollowUp(accessToken, item.encounterId, item.actionId, item.statusUpdatedAt);
          await dequeueFollowUpAction(item.encounterId, item.actionId);
        } catch (error) {
          if (error instanceof FollowUpConflictError) await dequeueFollowUpAction(item.encounterId, item.actionId);
          // Keep queued; retry on the next foreground/reconnect sync - same as card sync failures.
        }
      }
      onUpdated?.();
    } finally {
      setCompletingId(null);
    }
  }, [accessToken]);

  const markSnoozed = useCallback(async (
    item: FollowUpItem,
    snoozedUntil: string,
    onUpdated?: () => void,
  ) => {
    if (!accessToken) return;
    const key = `${item.encounterId}-${item.actionId}`;
    setCompletingId(key);
    try {
      const queuedAt = new Date().toISOString();
      await setCachedFollowUpStatus(item.encounterId, item.actionId, 'snoozed', {
        snoozedUntil,
        completedAt: undefined,
        dismissedAt: undefined,
        cancelledAt: undefined,
        statusUpdatedAt: queuedAt,
      });
      await enqueueFollowUpAction({
        encounterId: item.encounterId,
        actionId: item.actionId,
        action: 'snooze',
        snoozedUntil,
        queuedAt,
        expectedStatusUpdatedAt: item.statusUpdatedAt,
      });
      if (isOnline()) {
        try {
          await snoozeFollowUp(accessToken, item.encounterId, item.actionId, snoozedUntil, item.statusUpdatedAt);
          await dequeueFollowUpAction(item.encounterId, item.actionId);
        } catch (error) {
          if (error instanceof FollowUpConflictError) await dequeueFollowUpAction(item.encounterId, item.actionId);
          // Keep queued for foreground/reconnect sync.
        }
      }
      onUpdated?.();
    } finally {
      setCompletingId(null);
    }
  }, [accessToken]);

  const markDismissed = useCallback(async (
    item: FollowUpItem,
    onUpdated?: () => void,
  ) => {
    if (!accessToken) return;
    const key = `${item.encounterId}-${item.actionId}`;
    setCompletingId(key);
    try {
      const dismissedAt = new Date().toISOString();
      await setCachedFollowUpStatus(item.encounterId, item.actionId, 'dismissed', {
        dismissedAt,
        completedAt: undefined,
        snoozedUntil: undefined,
        cancelledAt: undefined,
        statusUpdatedAt: dismissedAt,
      });
      await enqueueFollowUpAction({
        encounterId: item.encounterId,
        actionId: item.actionId,
        action: 'dismiss',
        queuedAt: dismissedAt,
        expectedStatusUpdatedAt: item.statusUpdatedAt,
      });
      if (isOnline()) {
        try {
          await dismissFollowUp(accessToken, item.encounterId, item.actionId, item.statusUpdatedAt);
          await dequeueFollowUpAction(item.encounterId, item.actionId);
        } catch (error) {
          if (error instanceof FollowUpConflictError) await dequeueFollowUpAction(item.encounterId, item.actionId);
          // Keep queued for foreground/reconnect sync.
        }
      }
      onUpdated?.();
    } finally {
      setCompletingId(null);
    }
  }, [accessToken]);

  const closeMissing = useCallback(() => {
    setMissingOpen(false);
    setMissingExecution(null);
  }, []);

  const requestMissingField = useCallback(async () => {
    if (!accessToken || !missingExecution || missingExecution.type !== 'request') return;
    setLoading(true);
    try {
      await sendContactFieldRequest(accessToken, missingExecution);
      closeMissing();
    } finally {
      setLoading(false);
    }
  }, [accessToken, closeMissing, missingExecution]);

  const draftRequestEmail = useCallback(async () => {
    if (!missingExecution || missingExecution.type === 'open') return;
    setLoading(true);
    try {
      await openRequestEmail(missingExecution);
      closeMissing();
    } finally {
      setLoading(false);
    }
  }, [closeMissing, missingExecution]);

  const audienceParticipants = audienceItem
    ? participantsForEncounter(allFollowUps, audienceItem.encounterId)
    : [];

  return {
    runFollowUp,
    markComplete,
    markOpen,
    markSnoozed,
    markDismissed,
    completingId,
    missingOpen,
    missingExecution,
    missingLoading: loading,
    closeMissing,
    requestMissingField,
    draftRequestEmail,
    audienceOpen,
    audienceItem,
    audienceParticipants,
    confirmAudience,
    closeAudience,
  };
}
