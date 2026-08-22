export const CARD_LIBRARY_KEY = "aftermeet-card-library-v1";
export const ACTIVE_CARD_KEY = "aftermeet-active-card-v1";
export const MAX_CARDS = 5;

export type LibraryMethod = {
  id: string;
  type: string;
  value: string;
  label: string;
};

export type LibraryCard = {
  id: string;
  slug: string;
  label: string;
  name: string;
  role: string;
  company: string;
  bio: string;
  theme: string;
  photo: string;
  companyLogo: string;
  coverPhoto: string;
  showCompanyDetails?: boolean;
  methods: LibraryMethod[];
  createdAt: string;
  updatedAt: string;
  status?: "draft" | "published";
  publishedAt?: string | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const imageFingerprintCache = new Map<string, string>();

function imageFingerprint(value: string) {
  if (!value) return "";
  const cached = imageFingerprintCache.get(value);
  if (cached) return cached;

  // FNV-1a gives publish-state comparisons a compact, deterministic image
  // identity. Cache the result so changing a lightweight field such as theme
  // never walks multi-megabyte base64 image strings again.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const fingerprint = `${value.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  imageFingerprintCache.set(value, fingerprint);
  // Keep only the current/recent card assets rather than retaining an
  // unbounded history of large data URLs.
  if (imageFingerprintCache.size > 6) {
    imageFingerprintCache.delete(imageFingerprintCache.keys().next().value!);
  }
  return fingerprint;
}

function newIdentity() {
  const id = crypto.randomUUID();
  return { id, slug: `card-${id.replaceAll("-", "").slice(0, 16)}` };
}

export function createLibraryCard(seed: Partial<LibraryCard> = {}): LibraryCard {
  const identity = newIdentity();
  const now = new Date().toISOString();
  return {
    ...identity,
    label: "New card",
    name: "",
    role: "",
    company: "",
    bio: "",
    theme: "#9fe870",
    photo: "",
    companyLogo: "",
    coverPhoto: "",
    methods: [],
    ...seed,
    id: seed.id || identity.id,
    slug: seed.slug || identity.slug,
    createdAt: seed.createdAt || now,
    updatedAt: seed.updatedAt || now,
    status: seed.status || "draft",
    publishedAt: seed.publishedAt ?? null,
  };
}

export function cardPublishFingerprint(card: LibraryCard) {
  return JSON.stringify({
    slug: card.slug.trim(),
    label: card.label.trim(),
    name: card.name.trim(),
    role: card.role.trim(),
    company: card.company.trim(),
    bio: card.bio.trim(),
    theme: card.theme.toLowerCase(),
    photo: imageFingerprint(card.photo),
    companyLogo: imageFingerprint(card.companyLogo),
    coverPhoto: imageFingerprint(card.coverPhoto),
    showCompanyDetails: card.showCompanyDetails !== false,
    methods: card.methods.map((method) => ({
      id: method.id,
      type: method.type,
      value: method.value.trim(),
      label: method.label.trim(),
    })),
  });
}

export function preserveLocalCardImages(server: LibraryCard, local: LibraryCard) {
  return {
    ...server,
    photo: server.photo || local.photo,
    coverPhoto: server.coverPhoto || local.coverPhoto,
    companyLogo: server.companyLogo || local.companyLogo,
  };
}

// A card with none of these fields set was never actually edited - only
// created (e.g. by loading the create-card route and then navigating away
// before typing anything). It holds no user data, so it is safe to drop
// automatically rather than let it sit forever consuming one of MAX_CARDS
// slots. Never matches a published card: `status`/`publishedAt` are excluded
// from the check on purpose.
export function isOrphanDraftCard(card: LibraryCard) {
  return (
    card.status !== "published" &&
    !card.publishedAt &&
    !card.name.trim() &&
    !card.role.trim() &&
    !card.company.trim() &&
    !card.bio.trim() &&
    !card.photo &&
    !card.companyLogo &&
    !card.coverPhoto &&
    card.methods.length === 0
  );
}

export function canAddCard(storage: StorageLike, excludeId?: string) {
  const cards = readCardLibrary(storage);
  return cards.some((card) => card.id === excludeId) || cards.length < MAX_CARDS;
}

export function readCardLibrary(storage: StorageLike): LibraryCard[] {
  try {
    const stored = JSON.parse(storage.getItem(CARD_LIBRARY_KEY) || "[]");
    if (Array.isArray(stored) && stored.length) {
      const pruned = (stored as LibraryCard[]).filter((card) => !isOrphanDraftCard(card));
      if (pruned.length !== stored.length) writeCardLibrary(storage, pruned);
      return pruned.slice(0, MAX_CARDS);
    }

    const legacy = JSON.parse(storage.getItem("aftermeet-card-v2") || "null");
    if (legacy) {
      const migrated = createLibraryCard({
        ...legacy,
        id: legacy.id || "primary-card",
        slug: legacy.slug || "alex-morgan",
        label: legacy.label || "My primary card",
      });
      writeCardLibrary(storage, [migrated]);
      return [migrated];
    }
  } catch {}
  return [];
}

export function writeCardLibrary(storage: StorageLike, cards: LibraryCard[]) {
  storage.setItem(CARD_LIBRARY_KEY, JSON.stringify(cards.slice(0, MAX_CARDS)));
}

export function getActiveCardId(storage: StorageLike, cards: LibraryCard[]) {
  const stored = storage.getItem(ACTIVE_CARD_KEY);
  return cards.some((card) => card.id === stored) ? stored! : cards[0]?.id || "";
}

export function setActiveCardId(storage: StorageLike, id: string) {
  storage.setItem(ACTIVE_CARD_KEY, id);
}

export function upsertLibraryCard(storage: StorageLike, card: LibraryCard) {
  const cards = readCardLibrary(storage);
  const exists = cards.some((item) => item.id === card.id);
  if (!exists && cards.length >= MAX_CARDS) return cards;
  const nextCard = { ...card, updatedAt: new Date().toISOString() };
  const next = exists
    ? cards.map((item) => item.id === card.id ? nextCard : item)
    : [...cards, nextCard];
  writeCardLibrary(storage, next);
  setActiveCardId(storage, card.id);
  return next;
}

export function cardDisplayLabel(card: LibraryCard) {
  return card.label.trim() || "Untitled card";
}

export function cardLeadDetail(card: LibraryCard) {
  const firstMethod = card.methods.find((method) => method.value.trim());
  if (firstMethod?.value.trim()) return firstMethod.value.trim();
  if (card.role.trim()) return card.role.trim();
  if (card.company.trim()) return card.company.trim();
  return "Add contact details";
}

export function cardInitials(name: string) {
  return name.trim().split(/\s+/).map((part) => part[0] || "").join("").slice(0, 2).toUpperCase() || "AM";
}

export function removeLibraryCard(storage: StorageLike, id: string) {
  const next = readCardLibrary(storage).filter((card) => card.id !== id);
  writeCardLibrary(storage, next);
  setActiveCardId(storage, next[0]?.id || "");
  if (!next.length) {
    storage.removeItem("aftermeet-card-v2");
    storage.removeItem("aftermeet-profile-v1");
    storage.removeItem("aftermeet-profile-photo-v1");
  }
  return next;
}
