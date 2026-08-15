import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/auth-context';
import {
  ACTIVE_CARD_KEY,
  CARDS_STORAGE_KEY,
  createMobileCard,
  DIRTY_CARDS_STORAGE_KEY,
  getActiveCardId,
  LEGACY_CARD_KEY,
  libraryPayloadToMobileCard,
  MAX_CARDS,
  mobileCardToLibraryPayload,
  remoteRowToMobileCard,
} from '@/features/card/card-library';
import { CARD_THEMES, normalizeThemeColor } from '@/features/card/theme-colors';
import { isPreviewCard } from '@/features/card/default-card';
import type { ContactMethod, MobileCard } from '@/features/card/types';
import { syncCardToolsForCard } from '@/features/card/card-tools-sync';
import { uploadCardImagesForPublish } from '@/features/card/card-image-upload';
import { describePublishError, formatPublishError, type PublishCardResult, validateCardForPublish } from '@/features/card/publish-card';
import { dequeueCardDelete, enqueueCardDelete, readCardDeleteQueue } from '@/features/card/card-delete-queue';
import { readEnv } from '@/lib/env';
import { useForegroundSync } from '@/lib/background-sync';
import { mobileFetch } from '@/lib/mobile-api';
import { clearSyncFailure, recordSyncFailure, syncFailureKey } from '@/features/sync/sync-failure-store';
import { clearPublishedBaseline, ensurePublishedBaseline, writePublishedBaseline } from '@/lib/published-baseline';
import { getSupabase } from '@/lib/supabase';

type CardValue = {
  cards: MobileCard[];
  card: MobileCard;
  activeCardId: string;
  loading: boolean;
  syncing: boolean;
  publishing: boolean;
  publishError: string;
  publicUrl: string;
  canCreateCard: boolean;
  getCardById: (id: string) => MobileCard | undefined;
  cardPublicUrl: (card: MobileCard) => string;
  isPrimaryCard: (id: string) => boolean;
  setPrimaryCard: (id: string) => Promise<void>;
  setActiveCard: (id: string) => Promise<void>;
  createCard: (seed?: Partial<MobileCard>) => Promise<MobileCard | null>;
  updateCard: (changes: Partial<MobileCard>) => Promise<void>;
  updateCardById: (id: string, changes: Partial<MobileCard>) => Promise<void>;
  addMethod: (method: ContactMethod) => Promise<void>;
  removeMethod: (id: string) => Promise<void>;
  sync: () => Promise<void>;
  publish: () => Promise<PublishCardResult>;
  publishCard: (id?: string, cardOverride?: MobileCard) => Promise<PublishCardResult>;
  deleteCard: (id: string) => Promise<void>;
};

const CardContext = createContext<CardValue | null>(null);

function normalizeCard(card: MobileCard): MobileCard {
  const showCompanyDetails = card.showCompanyDetails ?? (card as { showCompanyLogo?: boolean }).showCompanyLogo ?? true;
  return {
    ...card,
    showCompanyDetails,
    theme: normalizeThemeColor(card.theme),
  };
}

function cardsSnapshot(cards: MobileCard[]) {
  return JSON.stringify(cards.map(normalizeCard));
}

function mapStoredCards(raw: unknown): MobileCard[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_CARDS).map((item) => normalizeCard({ ...createMobileCard(), ...(item as MobileCard) }));
}

function withoutPreviewCards(items: MobileCard[]) {
  return items.filter((item) => !isPreviewCard(item));
}

export function CardProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [cards, setCards] = useState<MobileCard[]>([]);
  const [activeCardId, setActiveCardIdState] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  const cardsRef = useRef(cards);
  const activeCardIdRef = useRef(activeCardId);
  const dirtyCardIdsRef = useRef(new Set<string>());
  useEffect(() => {
    cardsRef.current = cards;
    activeCardIdRef.current = activeCardId;
  }, [activeCardId, cards]);

  const visibleCards = useMemo(() => withoutPreviewCards(cards), [cards]);

  const activeCard = useMemo(
    () => visibleCards.find((item) => item.id === activeCardId) || visibleCards[0] || createMobileCard(),
    [activeCardId, visibleCards],
  );

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(CARDS_STORAGE_KEY),
      AsyncStorage.getItem(LEGACY_CARD_KEY),
      AsyncStorage.getItem(ACTIVE_CARD_KEY),
      AsyncStorage.getItem(DIRTY_CARDS_STORAGE_KEY),
    ]).then(([storedCards, legacyCard, storedActiveId, storedDirtyIds]) => {
      let nextCards = withoutPreviewCards(mapStoredCards(storedCards ? JSON.parse(storedCards) : []));
      if (!nextCards.length && legacyCard) {
        try {
          const legacy = normalizeCard({ ...createMobileCard(), ...JSON.parse(legacyCard) as MobileCard });
          if (!isPreviewCard(legacy)) nextCards = [legacy];
        } catch {}
      }
      setCards(nextCards);
      setActiveCardIdState(getActiveCardId(nextCards, storedActiveId));
      try {
        const dirtyIds = JSON.parse(storedDirtyIds || '[]');
        dirtyCardIdsRef.current = new Set(Array.isArray(dirtyIds) ? dirtyIds.filter((id): id is string => typeof id === 'string') : []);
      } catch {
        dirtyCardIdsRef.current = new Set();
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const setCardDirty = useCallback(async (id: string, dirty: boolean, replacementId?: string) => {
    const next = new Set(dirtyCardIdsRef.current);
    next.delete(id);
    if (replacementId) next.delete(replacementId);
    if (dirty) next.add(replacementId || id);
    dirtyCardIdsRef.current = next;
    await AsyncStorage.setItem(DIRTY_CARDS_STORAGE_KEY, JSON.stringify([...next]));
  }, []);

  const persistCards = useCallback(async (nextCards: MobileCard[], nextActiveId?: string) => {
    const normalized = nextCards.map(normalizeCard);
    const resolvedActiveId = nextActiveId ?? activeCardIdRef.current;
    if (
      resolvedActiveId === activeCardIdRef.current
      && cardsSnapshot(normalized) === cardsSnapshot(cardsRef.current)
    ) {
      return;
    }
    setCards(normalized);
    setActiveCardIdState(resolvedActiveId);
    await AsyncStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(normalized));
    await AsyncStorage.setItem(ACTIVE_CARD_KEY, resolvedActiveId);
    const active = normalized.find((item) => item.id === resolvedActiveId) || normalized[0];
    if (active) {
      const env = readEnv();
      const urlForCard = (target: MobileCard) =>
        `${env?.publicCardBaseUrl || 'http://localhost:3000'}/c/${target.slug}`;
      await syncCardToolsForCard(normalized, urlForCard, accessToken, active);
    }
  }, [accessToken]);

  const saveRemoteCard = useCallback(async (card: MobileCard, options?: { strictImages?: boolean }) => {
    if (!accessToken) return card;
    const token = accessToken;

    async function persistPayload(payload: MobileCard) {
      const response = await mobileFetch('/api/cards', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mobileCardToLibraryPayload(payload)),
      });
      if (!response.ok) {
        const responsePayload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(responsePayload?.error || 'We couldn’t save this card.');
      }
      const responsePayload = await response.json().catch(() => null) as {
        card?: Parameters<typeof libraryPayloadToMobileCard>[0];
      } | null;
      return responsePayload?.card ? libraryPayloadToMobileCard(responsePayload.card) : payload;
    }

    // Captured from the original argument, before any server round-trip —
    // the server can't read a device-local file://content:// URI and blanks
    // any image field it doesn't recognize (see resolveCardImageForPublish
    // in lib/card-assets.ts), so persistPayload's response below is not a
    // safe source for what to upload.
    const originalImages = {
      photo: card.photo || '',
      coverPhoto: card.coverPhoto || '',
      companyLogo: card.showCompanyDetails !== false ? (card.companyLogo || '') : '',
    };

    let payload = card;
    payload = await persistPayload(payload);

    if (!payload.id) return payload;

    try {
      const uploaded = await uploadCardImagesForPublish(token, payload.id, originalImages);
      const imagesChanged = uploaded.photo !== payload.photo
        || uploaded.coverPhoto !== payload.coverPhoto
        || uploaded.companyLogo !== payload.companyLogo;
      if (imagesChanged) {
        payload = await persistPayload({ ...payload, ...uploaded });
      }
    } catch (error) {
      if (options?.strictImages) {
        throw error instanceof Error ? error : new Error('Could not upload card images.');
      }
    }

    return payload;
  }, [accessToken]);

  const sync = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !session) return;
    setSyncing(true);
    try {
      if (session.access_token) {
        const queuedDeletes = await readCardDeleteQueue();
        for (const entry of queuedDeletes) {
          try {
            const { error } = await supabase.from('cards').update({ status: 'archived' }).eq('id', entry.cardId);
            if (error) throw error;
            await dequeueCardDelete(entry.cardId);
            await clearSyncFailure(syncFailureKey.cardDelete(entry.cardId));
          } catch (caught) {
            // Offline or the request failed — stays queued for the next foreground sync.
            await recordSyncFailure(syncFailureKey.cardDelete(entry.cardId), caught);
          }
        }
      }

      if (session.access_token && dirtyCardIdsRef.current.size) {
        const localCards = withoutPreviewCards(cardsRef.current);
        let reconciledCards = localCards;
        for (const local of localCards.filter((card) => card.id && dirtyCardIdsRef.current.has(card.id))) {
          try {
            const saved = await saveRemoteCard(local);
            reconciledCards = reconciledCards.map((card) => card.id === local.id ? saved : card);
            await setCardDirty(local.id!, false, saved.id);
            await clearSyncFailure(syncFailureKey.cardChange(local.id!));
          } catch (caught) {
            // Keep this local card dirty and retry on the next foreground sync.
            await recordSyncFailure(syncFailureKey.cardChange(local.id!), caught);
          }
        }
        if (cardsSnapshot(reconciledCards) !== cardsSnapshot(cardsRef.current)) {
          await persistCards(reconciledCards, getActiveCardId(reconciledCards, activeCardIdRef.current));
        }
      }

      // Re-check session right before this call (not just at the top of sync)
      // — a sign-out or a sign-in-in-progress token swap between here and the
      // dirty-card reconciliation above would otherwise fire this RPC with a
      // stale/missing session, which fails as a permission error since anon
      // has no grant on it.
      if (!session?.access_token) return;
      const { data: rawContext, error: contextError } = await supabase.rpc('get_my_app_context').single();
      if (contextError) return;
      const context = rawContext as { workspace_id?: string } | null;
      if (!context?.workspace_id) return;
      const { data: remoteRows } = await supabase
        .from('cards')
        .select('*, card_methods(*)')
        .eq('workspace_id', context.workspace_id)
        .neq('status', 'archived')
        .order('updated_at', { ascending: false })
        .limit(MAX_CARDS);
      if (remoteRows?.length) {
        const localCards = withoutPreviewCards(cardsRef.current);
        const remoteCards = remoteRows.map((row) => {
          const remote = remoteRowToMobileCard(row);
          const dirtyLocal = localCards.find((local) => (
            local.id === remote.id || local.slug === remote.slug
          ) && local.id && dirtyCardIdsRef.current.has(local.id));
          return dirtyLocal || remote;
        });
        await Promise.all(
          remoteCards
            .filter((item) => item.status === 'published')
            .map((item) => ensurePublishedBaseline(item)),
        );
        const remotePrimary = remoteCards.find((item) => item.isPrimary);
        const nextActiveId = remotePrimary?.id || getActiveCardId(remoteCards, activeCardIdRef.current);
        await persistCards(remoteCards, nextActiveId);
        if (!remotePrimary && nextActiveId) {
          // Pre-migration workspace with no server-side primary yet — adopt this
          // device's current pick as the canonical one so other devices see it.
          try {
            await supabase.rpc('set_primary_card', { p_card_id: nextActiveId });
          } catch {
            // Will retry on the next sync.
          }
        }
        return;
      }

      const localCards = withoutPreviewCards(cardsRef.current);
      if (!localCards.length || !session.access_token) return;

      const uploaded: MobileCard[] = [];
      for (const card of localCards) {
        try {
          uploaded.push(await saveRemoteCard(card));
        } catch {
          uploaded.push(card);
        }
      }
      if (uploaded.length) {
        const nextActiveId = getActiveCardId(uploaded, activeCardIdRef.current);
        await persistCards(uploaded, nextActiveId);
      }
    } finally {
      setSyncing(false);
    }
  }, [persistCards, saveRemoteCard, session, setCardDirty]);

  useForegroundSync(Boolean(session), sync);

  const setPrimaryCard = useCallback(async (id: string) => {
    const currentCards = cardsRef.current;
    const target = currentCards.find((item) => item.id === id);
    if (!target) return;
    if (id === activeCardIdRef.current) return;
    await persistCards(currentCards, id);
    if (target.id) {
      const supabase = getSupabase();
      try {
        await supabase?.rpc('set_primary_card', { p_card_id: target.id });
      } catch {
        // Local pick still applies; the next successful sync reconciles this device
        // against whichever card the server has marked primary.
      }
    }
  }, [persistCards]);

  const createCard = useCallback(async (seed: Partial<MobileCard> = {}) => {
    const currentCards = cardsRef.current;
    if (currentCards.length >= MAX_CARDS) {
      setPublishError('You can save a maximum of five cards.');
      return null;
    }
    const palette = CARD_THEMES[currentCards.length % CARD_THEMES.length];
    const card = createMobileCard({ theme: palette, ...seed });
    const nextCards = [...currentCards, card];
    await persistCards(nextCards, card.id!);
    await setCardDirty(card.id!, true);
    if (accessToken) {
      try {
        const saved = await saveRemoteCard(card);
        const syncedCards = nextCards.map((item) => (item.id === card.id ? saved : item));
        await persistCards(syncedCards, saved.id);
        await setCardDirty(card.id!, false, saved.id);
        return saved;
      } catch {
        // Local card remains available even if sync fails.
      }
    }
    return card;
  }, [accessToken, persistCards, saveRemoteCard, setCardDirty]);

  const updateCardById = useCallback(async (id: string, changes: Partial<MobileCard>) => {
    const current = cardsRef.current.find((item) => item.id === id);
    if (!current) return;
    const nextCard = normalizeCard({ ...current, ...changes, theme: normalizeThemeColor(changes.theme || current.theme) });
    const nextCards = cardsRef.current.map((item) => (item.id === id ? nextCard : item));
    await persistCards(nextCards);
    await setCardDirty(id, true);
    if (accessToken) {
      try {
        const saved = await saveRemoteCard(nextCard);
        if (saved) {
          const syncedCards = nextCards.map((item) => (item.id === id ? saved : item));
          await persistCards(syncedCards, activeCardIdRef.current === id ? saved.id : undefined);
          await setCardDirty(id, false, saved.id);
        }
      } catch {
        // Local edits remain available offline.
      }
      if (nextCard.status === 'published') {
        const synced = cardsRef.current.find((item) => item.id === id) || nextCard;
        await syncCardToolsForCard(
          cardsRef.current,
          (target) => `${readEnv()?.publicCardBaseUrl || 'http://localhost:3000'}/c/${target.slug}`,
          accessToken,
          synced,
        );
      }
    }
  }, [accessToken, persistCards, saveRemoteCard, setCardDirty]);

  const cardPublicUrl = useCallback((target: MobileCard) => {
    const env = readEnv();
    return `${env?.publicCardBaseUrl || 'http://localhost:3000'}/c/${target.slug}`;
  }, []);

  const publishCard = useCallback(async (id = activeCardId, cardOverride?: MobileCard): Promise<PublishCardResult> => {
    const target = cardOverride
      ?? cardsRef.current.find((item) => item.id === id)
      ?? cardsRef.current.find((item) => item.id === activeCardIdRef.current)
      ?? activeCard;
    if (!session) {
      const failure = describePublishError('Sign in to publish this card.');
      setPublishError(failure.message);
      return { ok: false, ...failure };
    }
    if (!target.id) {
      const failure = describePublishError('Save this card before publishing.');
      setPublishError(failure.message);
      return { ok: false, ...failure };
    }
    const validationError = validateCardForPublish(target);
    if (validationError) {
      const failure = describePublishError(validationError);
      setPublishError(failure.message);
      return { ok: false, ...failure };
    }

      setPublishing(true);
      setPublishError('');
      try {
        let publishTarget = target;
        if (session.access_token) {
          publishTarget = await saveRemoteCard(target, { strictImages: true }) || target;
        }

        const response = await mobileFetch('/api/cards/publish', session.access_token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...publishTarget,
            expectedUpdatedAt: publishTarget.serverUpdatedAt,
          }),
        });
        const publishPayload = await response.json().catch(() => null) as { cardId?: string; updatedAt?: string; error?: string } | null;
        if (!response.ok) throw new Error(publishPayload?.error || 'We couldn’t publish this card.');

        const publishedCard = normalizeCard({
          ...publishTarget,
          id: String(publishPayload?.cardId || publishTarget.id),
          serverUpdatedAt: publishPayload?.updatedAt || publishTarget.serverUpdatedAt,
          status: 'published',
        });
        const nextCards = cardsRef.current.map((item) => (
          item.id === target.id ? publishedCard : item
        ));
        await persistCards(nextCards, activeCardIdRef.current);

        void syncCardToolsForCard(
          nextCards,
          (card) => `${readEnv()?.publicCardBaseUrl || 'http://localhost:3000'}/c/${card.slug}`,
          session.access_token,
          publishedCard,
        );

        void writePublishedBaseline(publishedCard);

        const publicUrl = cardPublicUrl(publishedCard);
        return { ok: true, publicUrl };
    } catch (error) {
      const message = formatPublishError(error);
      const failure = describePublishError(message);
      setPublishError(failure.message);
      return { ok: false, ...failure };
    } finally {
      setPublishing(false);
    }
  }, [activeCard, activeCardId, cardPublicUrl, persistCards, saveRemoteCard, session]);

  const deleteCard = useCallback(async (id: string) => {
    const currentCards = cardsRef.current;
    const target = currentCards.find((item) => item.id === id);
    if (!target?.id) throw new Error('This card could not be found.');

    const supabase = getSupabase();
    let archived = false;
    if (supabase && session) {
      try {
        const { error } = await supabase.from('cards').update({ status: 'archived' }).eq('id', id);
        if (error) throw error;
        archived = true;
        await clearSyncFailure(syncFailureKey.cardDelete(id));
      } catch (caught) {
        // Offline or the request failed — queue it and retry on the next foreground sync
        // instead of blocking the local delete on connectivity.
        await recordSyncFailure(syncFailureKey.cardDelete(id), caught);
      }
    }
    if (archived) {
      await dequeueCardDelete(id);
    } else if (session) {
      // No session means this card never had a server copy to begin with —
      // nothing to queue. With a session, the archive above failed or was
      // skipped for connectivity, so remember to retry it later.
      await enqueueCardDelete({ cardId: id, cardLabel: target.label || target.name || 'Untitled card' });
    }

    let nextCards = currentCards.filter((item) => item.id !== id);
    if (!nextCards.length) nextCards = [createMobileCard()];
    const nextActiveId = getActiveCardId(
      nextCards,
      activeCardIdRef.current === id ? nextCards[0]?.id || '' : activeCardIdRef.current,
    );
    await persistCards(nextCards, nextActiveId);
    await setCardDirty(id, false);
    void clearPublishedBaseline(id);
  }, [persistCards, session, setCardDirty]);

  const getCardById = useCallback(
    (cardId: string) => cards.find((item) => item.id === cardId),
    [cards],
  );

  const value = useMemo<CardValue>(() => {
    return {
      cards: visibleCards,
      card: activeCard,
      activeCardId,
      loading,
      syncing,
      publishing,
      publishError,
      publicUrl: cardPublicUrl(activeCard),
      canCreateCard: visibleCards.length < MAX_CARDS,
      getCardById,
      cardPublicUrl,
      isPrimaryCard: (id) => id === activeCardId,
      setPrimaryCard,
      setActiveCard: setPrimaryCard,
      createCard,
      updateCard: (changes) => updateCardById(activeCard.id!, changes),
      updateCardById,
      addMethod: async (method) => updateCardById(activeCard.id!, {
        methods: [...activeCard.methods.filter((item) => item.type !== method.type), method],
      }),
      removeMethod: async (methodId) => updateCardById(activeCard.id!, {
        methods: activeCard.methods.filter((item) => item.id !== methodId),
      }),
      sync,
      publish: () => publishCard(activeCardId),
      publishCard,
      deleteCard,
    };
  }, [
    activeCard,
    activeCardId,
    visibleCards,
    createCard,
    deleteCard,
    loading,
    publishCard,
    publishError,
    publishing,
    setPrimaryCard,
    sync,
    syncing,
    updateCardById,
    getCardById,
    cardPublicUrl,
  ]);

  return <CardContext.Provider value={value}>{children}</CardContext.Provider>;
}

export function useCard() {
  const value = useContext(CardContext);
  if (!value) throw new Error('useCard must be used inside CardProvider');
  return value;
}
