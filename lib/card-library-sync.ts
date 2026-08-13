import {
  type LibraryCard,
  preserveLocalCardImages,
  readCardLibrary,
  writeCardLibrary,
} from "./card-library";
import { cardMatchesLocal } from "./cards-server";

let hydratePromise: Promise<LibraryCard[]> | null = null;
const pendingCardSyncs = new Map<string, LibraryCard>();
const activeCardSyncs = new Map<string, Promise<LibraryCard | null>>();

function replaceLocalCard(previousId: string, sentCard: LibraryCard, nextCard: LibraryCard) {
  const current = readCardLibrary(localStorage);
  const local = current.find((card) => card.id === previousId || card.id === nextCard.id);
  const reconciled = local ? {
    ...local,
    id: nextCard.id,
    photo: local.photo === sentCard.photo ? nextCard.photo : local.photo,
    coverPhoto: local.coverPhoto === sentCard.coverPhoto ? nextCard.coverPhoto : local.coverPhoto,
    companyLogo: local.companyLogo === sentCard.companyLogo ? nextCard.companyLogo : local.companyLogo,
  } : nextCard;
  writeCardLibrary(localStorage, [
    reconciled,
    ...current.filter((card) => card.id !== previousId && card.id !== nextCard.id),
  ]);
}

export async function syncCardToServer(card: LibraryCard) {
  try {
    const response = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { card?: LibraryCard; preview?: boolean };
    if (!payload.card) return null;
    replaceLocalCard(card.id, card, payload.card);
    return payload.card;
  } catch {
    return null;
  }
}

export async function hydrateCardLibraryFromServer() {
  if (typeof window === "undefined") return readCardLibrary(localStorage);
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const response = await fetch("/api/cards");
      if (!response.ok) return readCardLibrary(localStorage);

      const payload = await response.json() as { cards?: LibraryCard[]; preview?: boolean };
      if (payload.preview) return readCardLibrary(localStorage);

      let serverCards = payload.cards ?? [];
      const localCards = readCardLibrary(localStorage);

      for (const local of localCards) {
        const serverIndex = serverCards.findIndex((server) => cardMatchesLocal(server, local));
        if (serverIndex >= 0) {
          const server = serverCards[serverIndex];
          const reconciled = preserveLocalCardImages(server, local);
          serverCards = serverCards.map((card, index) => index === serverIndex ? reconciled : card);
          if (
            reconciled.photo !== server.photo
            || reconciled.coverPhoto !== server.coverPhoto
            || reconciled.companyLogo !== server.companyLogo
          ) {
            const synced = await syncCardToServer(reconciled);
            if (synced) {
              serverCards = serverCards.map((card, index) => index === serverIndex ? synced : card);
            }
          }
          continue;
        }
        const synced = await syncCardToServer(local);
        if (synced) {
          serverCards = [synced, ...serverCards.filter((card) => card.id !== synced.id)];
        }
      }

      if (serverCards.length) {
        writeCardLibrary(localStorage, serverCards);
        return serverCards;
      }

      return readCardLibrary(localStorage);
    } finally {
      hydratePromise = null;
    }
  })();

  return hydratePromise;
}

export function queueCardSync(card: LibraryCard) {
  pendingCardSyncs.set(card.id, card);
  if (activeCardSyncs.has(card.id)) return;

  const run = (async () => {
    let synced: LibraryCard | null = null;
    while (pendingCardSyncs.has(card.id)) {
      const next = pendingCardSyncs.get(card.id)!;
      pendingCardSyncs.delete(card.id);
      synced = await syncCardToServer(next);
    }
    return synced;
  })().finally(() => {
    activeCardSyncs.delete(card.id);
    if (pendingCardSyncs.has(card.id)) queueCardSync(pendingCardSyncs.get(card.id)!);
  });

  activeCardSyncs.set(card.id, run);
}

export async function flushCardSync(card: LibraryCard) {
  const local = readCardLibrary(localStorage).find((item) => item.id === card.id);
  const candidate = local ? { ...card, updatedAt: local.updatedAt } : card;
  queueCardSync(candidate);
  return activeCardSyncs.get(card.id) ?? null;
}
