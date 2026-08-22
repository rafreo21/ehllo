"use client";

import type { IconComponent } from "../../../../lib/icon-component";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useSearchParams } from "next/navigation";
import * as nextNavigation from "next/navigation";
import { Briefcase as BriefcaseIcon } from "react-feather";
import { Calendar as CalendarBlankIcon } from "react-feather";
import { MessageCircle as ChatCircleDotsIcon } from "react-feather";
import { DollarSign as CurrencyDollarIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { Mail as EnvelopeSimpleIcon } from "react-feather";
import { Globe as GlobeIcon } from "react-feather";
import { DiscordLogoIcon } from "@phosphor-icons/react/dist/csr/DiscordLogo";
import { Edit2 as PencilSimpleIcon } from "react-feather";
import { Facebook as FacebookLogoIcon } from "react-feather";
import { GitHub as GithubLogoIcon } from "react-feather";
import { Instagram as InstagramLogoIcon } from "react-feather";
import { Link as LinkIcon } from "react-feather";
import { Linkedin as LinkedinLogoIcon } from "react-feather";
import { MapPin as MapPinIcon } from "react-feather";
import { PaypalLogoIcon } from "@phosphor-icons/react/dist/csr/PaypalLogo";
import { Phone as PhoneIcon } from "react-feather";
import { Plus as PlusIcon } from "react-feather";
import { SkypeLogoIcon } from "@phosphor-icons/react/dist/csr/SkypeLogo";
import { SnapchatLogoIcon } from "@phosphor-icons/react/dist/csr/SnapchatLogo";
import { Star as StarIcon } from "react-feather";
import { TelegramLogoIcon } from "@phosphor-icons/react/dist/csr/TelegramLogo";
import { ThreadsLogoIcon } from "@phosphor-icons/react/dist/csr/ThreadsLogo";
import { TiktokLogoIcon } from "@phosphor-icons/react/dist/csr/TiktokLogo";
import { Twitch as TwitchLogoIcon } from "react-feather";
import { WhatsappLogoIcon } from "@phosphor-icons/react/dist/csr/WhatsappLogo";
import { X as XIcon } from "react-feather";
import { XLogoIcon } from "@phosphor-icons/react/dist/csr/XLogo";
import { Youtube as YoutubeLogoIcon } from "react-feather";
import { useAppShellChrome } from "../../../components/AppShellChromeContext";
import { Button, LinkButton } from "../../../components/Button";
import { CardFlowSkeleton } from "../../../components/AsyncState";
import { CardImage } from "../../../components/CardImage";
import { InlineEditField } from "../../../components/InlineEditField";
import { useToast } from "../../../components/ToastContext";
import { Check as CheckIcon } from "react-feather";
import { ChevronRight as ChevronRightIcon } from "react-feather";
import { themeCoverBadgeStyle, themeForegroundColor, themeGradientCss, themeSurfaceStyle } from "../../../../lib/theme-contrast";
import {
  cardPublishFingerprint,
  createLibraryCard,
  getActiveCardId,
  type LibraryCard,
  MAX_CARDS,
  readCardLibrary,
  removeLibraryCard,
  setActiveCardId,
  upsertLibraryCard,
} from "../../../../lib/card-library";
import { flushCardSync, hydrateCardLibraryFromServer, queueCardSync } from "../../../../lib/card-library-sync";

type MethodType =
  | "email" | "phone" | "website" | "link" | "address"
  | "x" | "instagram" | "threads" | "linkedin" | "facebook" | "youtube" | "snapchat" | "tiktok" | "twitch" | "yelp"
  | "whatsapp" | "signal" | "discord" | "skype" | "telegram"
  | "github" | "calendly"
  | "paypal" | "venmo" | "cashapp";
type ContactMethod = { id: string; type: MethodType; value: string; label: string };
type CardDraft = {
  id: string; slug: string; createdAt: string; updatedAt: string;
  label: string; name: string; role: string; company: string; bio: string;
  theme: string; photo: string; companyLogo: string; coverPhoto: string; methods: ContactMethod[];
  showCompanyDetails?: boolean;
  status?: "draft" | "published";
  publishedAt?: string | null;
};

// These method types still render a Phosphor logo mark (no faithful react-feather
// equivalent exists), so they alone keep the `weight="bold"` prop on their icon below.
const PHOSPHOR_METHOD_TYPES = new Set<MethodType>([
  "x", "threads", "snapchat", "tiktok", "whatsapp", "discord", "skype", "telegram", "paypal",
]);

const methodMeta: Record<MethodType, { category: string; name: string; placeholder: string; label: string; Icon: IconComponent }> = {
  email: { category: "General", name: "Email", placeholder: "you@example.com", label: "Work", Icon: EnvelopeSimpleIcon },
  phone: { category: "General", name: "Phone", placeholder: "+44 7700 900000", label: "Mobile", Icon: PhoneIcon },
  website: { category: "General", name: "Company URL", placeholder: "https://yourcompany.com", label: "Visit our website", Icon: GlobeIcon },
  link: { category: "General", name: "Link", placeholder: "https://example.com", label: "Open link", Icon: LinkIcon },
  address: { category: "General", name: "Address", placeholder: "Street, city, postcode", label: "Office", Icon: MapPinIcon },
  x: { category: "Social", name: "X", placeholder: "@username or profile URL", label: "Follow me on X", Icon: XLogoIcon },
  instagram: { category: "Social", name: "Instagram", placeholder: "@username or profile URL", label: "Follow on Instagram", Icon: InstagramLogoIcon },
  threads: { category: "Social", name: "Threads", placeholder: "@username or profile URL", label: "Follow on Threads", Icon: ThreadsLogoIcon },
  linkedin: { category: "Social", name: "LinkedIn", placeholder: "Profile URL or username", label: "Connect on LinkedIn", Icon: LinkedinLogoIcon },
  facebook: { category: "Social", name: "Facebook", placeholder: "Profile or page URL", label: "Find us on Facebook", Icon: FacebookLogoIcon },
  youtube: { category: "Social", name: "YouTube", placeholder: "Channel URL or handle", label: "Watch on YouTube", Icon: YoutubeLogoIcon },
  snapchat: { category: "Social", name: "Snapchat", placeholder: "Username or profile URL", label: "Add on Snapchat", Icon: SnapchatLogoIcon },
  tiktok: { category: "Social", name: "TikTok", placeholder: "@username or profile URL", label: "Follow on TikTok", Icon: TiktokLogoIcon },
  twitch: { category: "Social", name: "Twitch", placeholder: "Channel URL or username", label: "Watch on Twitch", Icon: TwitchLogoIcon },
  yelp: { category: "Social", name: "Yelp", placeholder: "Business page URL", label: "Review us on Yelp", Icon: StarIcon },
  whatsapp: { category: "Messaging", name: "WhatsApp", placeholder: "Number or wa.me link", label: "Message on WhatsApp", Icon: WhatsappLogoIcon },
  signal: { category: "Messaging", name: "Signal", placeholder: "Username or phone number", label: "Message on Signal", Icon: ChatCircleDotsIcon },
  discord: { category: "Messaging", name: "Discord", placeholder: "Username or invite URL", label: "Connect on Discord", Icon: DiscordLogoIcon },
  skype: { category: "Messaging", name: "Skype", placeholder: "Skype username", label: "Call on Skype", Icon: SkypeLogoIcon },
  telegram: { category: "Messaging", name: "Telegram", placeholder: "@username or t.me link", label: "Message on Telegram", Icon: TelegramLogoIcon },
  github: { category: "Business", name: "GitHub", placeholder: "Username or profile URL", label: "View my GitHub", Icon: GithubLogoIcon },
  calendly: { category: "Business", name: "Calendly", placeholder: "https://calendly.com/you", label: "Book a meeting", Icon: CalendarBlankIcon },
  paypal: { category: "Payment", name: "PayPal", placeholder: "PayPal.me URL or username", label: "Pay with PayPal", Icon: PaypalLogoIcon },
  venmo: { category: "Payment", name: "Venmo", placeholder: "Venmo username or URL", label: "Pay with Venmo", Icon: CurrencyDollarIcon },
  cashapp: { category: "Payment", name: "Cash App", placeholder: "$cashtag or URL", label: "Pay with Cash App", Icon: CurrencyDollarIcon },
};

const methodCategories = ["General", "Social", "Messaging", "Business", "Payment"] as const;
const methodFieldLabels: Partial<Record<MethodType, string>> = {
  email: "Email address",
  phone: "Phone number",
  website: "Company website URL",
  link: "Destination URL",
  address: "Street address",
  calendly: "Booking page URL",
  whatsapp: "WhatsApp number or link",
  signal: "Signal username or number",
  discord: "Discord username or invite",
  skype: "Skype username",
  telegram: "Telegram username or link",
  paypal: "PayPal username or link",
  venmo: "Venmo username or link",
  cashapp: "Cash App cashtag or link",
};

function fieldLabel(type: MethodType) {
  if (methodFieldLabels[type]) return methodFieldLabels[type]!;
  if (["x", "instagram", "threads", "linkedin", "facebook", "youtube", "snapchat", "tiktok", "twitch", "yelp", "github"].includes(type)) {
    return "Profile URL or username";
  }
  return `${methodMeta[type].name} details`;
}

function suggestionsFor(type: MethodType) {
  if (type === "phone") return ["Mobile", "Work", "Home", "Office"];
  if (type === "email") return ["Work", "Personal", "Bookings", "Press"];
  if (type === "address") return ["Office", "Studio", "Shop", "Meet me here"];
  if (["website", "link"].includes(type)) return ["Visit our website", "View my work", "Learn more"];
  if (type === "calendly") return ["Book a meeting", "Schedule a call", "Check availability"];
  if (["paypal", "venmo", "cashapp"].includes(type)) return ["Send a payment", "Pay me", "Tip me"];
  if (["whatsapp", "signal", "discord", "skype", "telegram"].includes(type)) return [`Message on ${methodMeta[type].name}`, "Chat with me", "Get in touch"];
  return [`Connect on ${methodMeta[type].name}`, `Follow on ${methodMeta[type].name}`, "View profile"];
}

// Used as the very first render's state, before hydration resolves the
// real card - so it must stay genuinely blank. A filled-in demo person
// here flashes on screen on every visit to create/edit, before snapping
// to the real (often empty) draft a moment later.
const initialDraft: CardDraft = {
  id: "primary-card",
  slug: "",
  createdAt: "",
  updatedAt: "",
  label: "My primary card",
  name: "",
  role: "",
  company: "",
  bio: "",
  theme: "#9fe870",
  photo: "",
  companyLogo: "",
  coverPhoto: "",
  showCompanyDetails: true,
  methods: [],
};

const themes = ["#9fe870", "#ff6b5e", "#ff9f43", "#ffc107", "#14b8a6", "#2495e8", "#5146e5", "#a83df0", "#163300", "#aeb8aa"];
const isPublishedCard = (card: CardDraft) => card.status === "published" || Boolean(card.publishedAt);

// vinext (this app's dev AND build/production runtime - see package.json's
// build scripts, it's not just a local convenience layer) monkey-patches
// window.history.replaceState to trigger a full client-side navigation and
// RSC re-render on every call. Stock Next.js treats a raw replaceState call
// as invisible to the router, which is what the ?id= URL claim below was
// relying on - under vinext it instead silently re-ran this page's whole
// mount effect mid-edit, discarding in-progress state. This is exactly
// what was surfacing as the create flow "hanging" or "not working" after
// the first field was confirmed. vinext exports its own escape hatch for
// this; next/navigation's shipped types don't know about it since it is
// vinext-specific, hence the loose typing here.
type NavigationWithVinextExtras = typeof nextNavigation & {
  replaceHistoryStateWithoutNotify?: (data: unknown, unused: string, url: string) => void;
};

function silentlyReplaceUrl(url: string) {
  const nav = nextNavigation as NavigationWithVinextExtras;
  if (typeof nav.replaceHistoryStateWithoutNotify === "function") {
    nav.replaceHistoryStateWithoutNotify(null, "", url);
  } else {
    window.history.replaceState(null, "", url);
  }
}

function isCreateFlow(search: string) {
  const params = new URLSearchParams(search);
  return params.get("new") === "1" || params.get("mode") === "create";
}

type DraftResolution =
  | { kind: "limit" }
  | { kind: "create"; card: CardDraft }
  | { kind: "existing"; card: CardDraft };

// A create-flow draft is only ever built in memory here - it never touches
// storage. It is persisted (and only then claims a stable ?id= in the URL)
// on the user's first real edit, in persistDraft. Loading this route and
// abandoning it - back button, closing the sheet, retrying - must never
// leave a blank orphan card behind that silently eats into the MAX_CARDS
// cap and causes a later create attempt to land back on an existing card.
function resolveDraft(search: string, cards: LibraryCard[]): DraftResolution {
  if (typeof window === "undefined") return { kind: "existing", card: initialDraft };
  try {
    const params = new URLSearchParams(search);
    const requestedId = params.get("id");
    if (isCreateFlow(search)) {
      if (cards.length >= MAX_CARDS) return { kind: "limit" };
      const created = createLibraryCard({
        ...initialDraft,
        id: undefined,
        slug: undefined,
        label: `Card ${cards.length + 1}`,
        name: "",
        role: "",
        company: "",
        bio: "",
        methods: [],
      });
      return { kind: "create", card: created as CardDraft };
    }
    const requestedIdOrActive = requestedId || getActiveCardId(localStorage, cards);
    const selected = cards.find((card) => card.id === requestedIdOrActive) || cards[0];
    if (selected) {
      setActiveCardId(localStorage, selected.id);
      return { kind: "existing", card: { ...initialDraft, ...selected } as CardDraft };
    }
    const legacy = JSON.parse(localStorage.getItem("aftermeet-profile-v1") || "null");
    const photo = localStorage.getItem("aftermeet-profile-photo-v1") || "";
    if (legacy) {
      return {
        kind: "existing",
        card: {
          ...initialDraft, ...legacy, photo,
          methods: [
            { id: "email", type: "email", value: legacy.email || "", label: "Work" },
            { id: "website", type: "website", value: legacy.website || "", label: "Visit my website" },
          ],
        },
      };
    }
  } catch {}
  return { kind: "existing", card: initialDraft };
}

export default function CardEditor() {
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const searchString = searchParams.toString();
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<CardDraft>(initialDraft);
  const draftRef = useRef<CardDraft>(initialDraft);
  const loadedDraftRef = useRef<CardDraft | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [cardLimitReached, setCardLimitReached] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishedFingerprint, setPublishedFingerprint] = useState("");
  const [hasEditBaseline, setHasEditBaseline] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);
  const [leaveAction, setLeaveAction] = useState<"save" | "discard" | "">("");
  const [editing, setEditing] = useState<ContactMethod | null>(null);
  const [showMethodLibrary, setShowMethodLibrary] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [methodError, setMethodError] = useState("");
  const [draggingMethodId, setDraggingMethodId] = useState<string | null>(null);
  const [dropTargetMethodId, setDropTargetMethodId] = useState<string | null>(null);
  const methodDragRef = useRef(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const hasUnpublishedRef = useRef(false);
  const pendingNavigationRef = useRef<null | (() => void)>(null);
  const suppressBeforeUnloadRef = useRef(false);
  const themePersistTimerRef = useRef<number | null>(null);
  const pendingThemeDraftRef = useRef<CardDraft | null>(null);
  const saveActionRef = useRef<() => void>(() => {});
  const labelConfirmRef = useRef<(value: string) => void>(() => {});
  // True once the in-progress create-flow draft has been persisted at least
  // once and has therefore claimed a real ?id= in the URL. Guards against
  // re-claiming (and re-writing history) on every subsequent keystroke.
  const hasClaimedCreateUrlRef = useRef(false);

  useEffect(() => () => {
    if (themePersistTimerRef.current !== null) window.clearTimeout(themePersistTimerRef.current);
  }, []);

  useEffect(() => {
    const requestedSearch = searchString;
    const applyResolution = (cards: LibraryCard[]) => {
      const activeSearch = typeof window === "undefined" ? requestedSearch : window.location.search;
      const resolution = resolveDraft(activeSearch, cards);
      if (resolution.kind === "limit") {
        setCardLimitReached(true);
        setHydrated(true);
        return;
      }
      const creatingFlow = resolution.kind === "create";
      const loaded = resolution.card;
      hasClaimedCreateUrlRef.current = false;
      setCardLimitReached(false);
      loadedDraftRef.current = creatingFlow ? null : loaded;
      draftRef.current = loaded;
      setDraft(loaded);
      setPublishedFingerprint(cardPublishFingerprint(loaded));
      setHasEditBaseline(!creatingFlow);
      setSaved(isPublishedCard(loaded));
      setIsCreating(creatingFlow);
      setHydrated(true);
    };
    void hydrateCardLibraryFromServer()
      .then(applyResolution)
      .catch(() => applyResolution(readCardLibrary(localStorage)));
  }, [searchString]);

  const initials = draft.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const previewTheme = useMemo(() => themeSurfaceStyle(draft.theme), [draft.theme]);
  const coverBadgeStyle = useMemo(() => themeCoverBadgeStyle(draft.theme), [draft.theme]);
  const methodTypeCounts = draft.methods.reduce<Partial<Record<MethodType, number>>>((counts, method) => {
    counts[method.type] = (counts[method.type] ?? 0) + 1;
    return counts;
  }, {});
  const showCompanyDetails = draft.showCompanyDetails !== false;
  const visibleMethods = showCompanyDetails
    ? draft.methods
    : draft.methods.filter((method) => method.type !== "website");
  const collapsedPreviewMethods = visibleMethods.filter((method) => method.id !== editing?.id);
  const hasUnpublishedChanges = hydrated && (hasEditBaseline ? cardPublishFingerprint(draft) !== publishedFingerprint : isCreating);
  useEffect(() => {
    hasUnpublishedRef.current = hasUnpublishedChanges;
  }, [hasUnpublishedChanges]);
  const publishLabel = publishing
    ? "Publishing…"
    : !hasUnpublishedChanges && saved
      ? "Published"
      : saved
        ? "Publish changes"
        : "Save and publish";
  const shouldShowLeavePrompt = showLeavePrompt && hasUnpublishedChanges;

  function persistDraft(next: CardDraft) {
    if (!hydrated) return;
    const existingCards = readCardLibrary(localStorage);
    const alreadyStored = existingCards.some((card) => card.id === next.id);
    if (!alreadyStored && existingCards.length >= MAX_CARDS) {
      // The cap filled up (another tab, another device) between this page
      // loading and the user's first edit here. upsertLibraryCard would
      // otherwise silently no-op and the edit would vanish with no signal.
      setCardLimitReached(true);
      return;
    }
    upsertLibraryCard(localStorage, next);
    setActiveCardId(localStorage, next.id);
    if (isCreating && !alreadyStored && !hasClaimedCreateUrlRef.current) {
      hasClaimedCreateUrlRef.current = true;
      silentlyReplaceUrl(`/app/card/edit?id=${next.id}`);
    }
    localStorage.setItem("aftermeet-card-v2", JSON.stringify(next));
    localStorage.setItem("aftermeet-profile-v1", JSON.stringify({
      name: next.name, role: next.role, company: next.company, bio: next.bio,
      email: next.methods.find((item) => item.type === "email")?.value || "",
      website: next.methods.find((item) => item.type === "website")?.value || "",
    }));
    if (next.photo) localStorage.setItem("aftermeet-profile-photo-v1", next.photo);
    else localStorage.removeItem("aftermeet-profile-photo-v1");
    queueCardSync(next);
  }

  function cancelScheduledThemePersist() {
    if (themePersistTimerRef.current !== null) {
      window.clearTimeout(themePersistTimerRef.current);
      themePersistTimerRef.current = null;
    }
    pendingThemeDraftRef.current = null;
  }

  function scheduleThemePersist(next: CardDraft) {
    pendingThemeDraftRef.current = next;
    if (themePersistTimerRef.current !== null) window.clearTimeout(themePersistTimerRef.current);
    themePersistTimerRef.current = window.setTimeout(() => {
      themePersistTimerRef.current = null;
      const pending = pendingThemeDraftRef.current;
      pendingThemeDraftRef.current = null;
      if (pending) persistDraft(pending);
    }, 300);
  }

  const update = <K extends keyof CardDraft>(key: K, value: CardDraft[K]) => {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    setDraft(next);
    if (key === "theme") {
      scheduleThemePersist(next);
      return;
    }
    cancelScheduledThemePersist();
    // Persistence includes storage, sync and (for the first create edit) URL
    // work. Keep all of it outside React's replayable state-updater callbacks.
    persistDraft(next);
  };

  function moveMethod(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const methods = [...draftRef.current.methods];
    const sourceIndex = methods.findIndex((method) => method.id === sourceId);
    const targetIndex = methods.findIndex((method) => method.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = methods.splice(sourceIndex, 1);
    methods.splice(targetIndex, 0, moved);
    update("methods", methods);
  }

  function moveVisibleMethod(methodId: string, direction: -1 | 1) {
    const index = collapsedPreviewMethods.findIndex((method) => method.id === methodId);
    const target = collapsedPreviewMethods[index + direction];
    if (target) moveMethod(methodId, target.id);
  }

  async function save() {
    cancelScheduledThemePersist();
    persistDraft(draftRef.current);
    setPublishing(true);
    setSaveError("");
    try {
      const savedDraft = await flushCardSync(draftRef.current);
      if (!savedDraft) throw new Error("This card changed on another device. Reload the latest card before publishing again.");
      const response = await fetch("/api/cards/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...savedDraft, expectedUpdatedAt: savedDraft.updatedAt }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "We couldn’t publish this card.");
      // flushCardSync returns the persisted LibraryCard shape, which types its
      // method kind as a plain string. These are the methods we just sent, so
      // narrowing them back is safe.
      const published: CardDraft = {
        ...savedDraft,
        methods: savedDraft.methods as ContactMethod[],
        updatedAt: result.updatedAt || savedDraft.updatedAt,
        status: "published" as const,
        publishedAt: new Date().toISOString(),
      };
      draftRef.current = published;
      loadedDraftRef.current = published;
      setDraft(published);
      persistDraft(published);
      setPublishedFingerprint(cardPublishFingerprint(published));
      setHasEditBaseline(true);
      setIsCreating(false);
      setSaved(true);
      showToast({ tone: "success", message: "Card published successfully." });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "We couldn’t publish this card.");
    } finally {
      setPublishing(false);
    }
  }

  function selectPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    selectImage("photo", event);
  }

  function selectImage(key: "photo" | "companyLogo" | "coverPhoto", event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => update(key, String(reader.result));
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function openMethod(type: MethodType) {
    if ((methodTypeCounts[type] ?? 0) >= 3) return;
    setMethodError("");
    setEditing({ id: crypto.randomUUID(), type, value: "", label: methodMeta[type].label });
    setShowMethodLibrary(false);
  }

  function saveMethod() {
    if (!editing) return;
    const value = editing.value.trim();
    if (!value) return setMethodError("Enter a value before saving.");
    if (editing.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setMethodError("Enter a valid email address.");
    if (["website", "link", "calendly"].includes(editing.type)) {
      try { new URL(value); } catch { return setMethodError("Include the full address, beginning with https://"); }
    }
    const exists = draft.methods.some((item) => item.id === editing.id);
    update("methods", exists
      ? draft.methods.map((item) => item.id === editing.id ? editing : item)
      : [...draft.methods, editing]);
    setEditing(null);
  }

  function finishMethodEditing(event: React.FocusEvent<HTMLElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    if (!editing) return;
    const exists = draft.methods.some((item) => item.id === editing.id);
    if (!editing.value.trim() && !exists) {
      setMethodError("");
      setEditing(null);
      return;
    }
    saveMethod();
  }

  const requestNavigation = useCallback((_href: string, proceed: () => void) => {
    if (!hasUnpublishedRef.current) {
      proceed();
      return;
    }
    pendingNavigationRef.current = proceed;
    setShowLeavePrompt(true);
  }, []);

  // AppShellChrome stores this React node in context. If a fresh node is
  // created on every editor render, its effect updates the provider, which
  // re-renders this consumer and creates another node indefinitely. Keep the
  // node stable until its visible state actually changes; the ref ensures its
  // click always invokes the current save implementation and latest draft.
  useEffect(() => {
    saveActionRef.current = () => { void save(); };
    labelConfirmRef.current = (value) => update("label", value);
  });
  const appShellLeading = useMemo(() => hydrated ? (
    <InlineEditField
      key={`${draft.id}-${hydrated ? "ready" : "loading"}`}
      as="span"
      className="product-page-card-label"
      defaultValue={draft.label}
      onConfirm={(value) => labelConfirmRef.current(value)}
      placeholder="Card label"
      ariaLabel="Card label"
      maxLength={60}
    />
  ) : null, [draft.id, draft.label, hydrated]);
  const appShellActions = useMemo(() => !hydrated || cardLimitReached ? null : (
    <Button
      size="small"
      loading={publishing}
      disabled={!hasUnpublishedChanges && saved}
      onClick={() => saveActionRef.current()}
    >
      {!hasUnpublishedChanges && saved ? <CheckCircleIcon /> : null}
      {publishLabel}
    </Button>
  ), [hydrated, cardLimitReached, publishing, hasUnpublishedChanges, saved, publishLabel]);

  useAppShellChrome({
    backHref: "/app/cards",
    backLabel: "",
    requestNavigation,
    leading: appShellLeading,
    actions: appShellActions,
  });

  const cancelNavigation = useCallback(() => {
    suppressBeforeUnloadRef.current = false;
    setLeaveAction("");
    setShowLeavePrompt(false);
    pendingNavigationRef.current = null;
  }, []);

  function completePendingNavigation() {
    const next = pendingNavigationRef.current;
    suppressBeforeUnloadRef.current = true;
    setShowLeavePrompt(false);
    pendingNavigationRef.current = null;
    next?.();
  }

  async function saveDraftAndLeave() {
    setLeaveAction("save");
    cancelScheduledThemePersist();
    const latest = draftRef.current;
    persistDraft(latest);
    await flushCardSync(latest).catch(() => null);
    showToast({ tone: "success", message: "Draft saved." });
    completePendingNavigation();
  }

  async function discardChangesAndLeave() {
    setLeaveAction("discard");
    cancelScheduledThemePersist();
    const latest = draftRef.current;
    const baseline = loadedDraftRef.current;

    if (baseline) {
      draftRef.current = baseline;
      setDraft(baseline);
      persistDraft(baseline);
      await flushCardSync(baseline).catch(() => null);
    } else {
      const wasStored = readCardLibrary(localStorage).some((card) => card.id === latest.id);
      if (wasStored) {
        await flushCardSync(latest).catch(() => null);
        await fetch(`/api/cards?id=${encodeURIComponent(latest.id)}`, { method: "DELETE" }).catch(() => null);
        removeLibraryCard(localStorage, latest.id);
      }
    }

    completePendingNavigation();
  }

  useEffect(() => {
    if (!hasUnpublishedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (suppressBeforeUnloadRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnpublishedChanges]);

  useEffect(() => {
    return () => {
      suppressBeforeUnloadRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!shouldShowLeavePrompt) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !leaveAction) {
        cancelNavigation();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [shouldShowLeavePrompt, leaveAction, cancelNavigation]);

  useEffect(() => {
    if (!showMethodLibrary && !showThemePicker) return;
    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMethodLibrary(false);
        setShowThemePicker(false);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showMethodLibrary, showThemePicker]);

  if (!hydrated) return <CardFlowSkeleton />;

  if (cardLimitReached) {
    return (
      <section className="card-creator">
        <div className="creator-publish-state is-dirty" role="status">
          <span>You’ve reached your card limit</span>
          <small>ehllo supports up to {MAX_CARDS} cards per account. Delete one to make room for a new one.</small>
        </div>
        <LinkButton fullWidth href="/app/cards">Back to your cards</LinkButton>
      </section>
    );
  }

  return (
    <>
      {shouldShowLeavePrompt && (
        <div className="connections-modal-backdrop add-followup-modal-backdrop" role="presentation" onClick={() => { if (!leaveAction) cancelNavigation(); }}>
          <section className="connections-modal" role="dialog" aria-modal="true" aria-labelledby="leave-card-editor-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2 id="leave-card-editor-title">Unsaved changes</h2>
              <button type="button" aria-label="Close leave prompt" disabled={Boolean(leaveAction)} onClick={cancelNavigation}><XIcon /></button>
            </header>
            <p>Save your latest changes as a draft, or discard them and leave this page.</p>
            <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
              <Button size="small" variant="secondary" loading={leaveAction === "discard"} disabled={Boolean(leaveAction)} onClick={() => void discardChangesAndLeave()}>Discard changes</Button>
              <Button size="small" loading={leaveAction === "save"} disabled={Boolean(leaveAction)} onClick={() => void saveDraftAndLeave()}>Save to draft</Button>
            </div>
          </section>
        </div>
      )}
      {showMethodLibrary && (
        <div className="method-library-sheet-backdrop" role="presentation" onClick={() => setShowMethodLibrary(false)}>
          <section className="method-library-sheet" role="dialog" aria-modal="true" aria-labelledby="method-library-title" onClick={(event) => event.stopPropagation()}>
            <header className="method-library-sheet-header">
              <div>
                <span className="method-library-add-icon" aria-hidden="true" style={{ color: previewTheme.backgroundColor }}><PlusIcon size={18} /></span>
                <div><h2 id="method-library-title">Add a contact method</h2><p>Choose how people can connect with you.</p></div>
              </div>
              <button type="button" aria-label="Close contact method sheet" onClick={() => setShowMethodLibrary(false)}><XIcon size={19} /></button>
            </header>
            <div className="method-library-sheet-content">
              {methodCategories.map((category) => {
                const availableTypes = (Object.keys(methodMeta) as MethodType[]).filter(
                  (type) => methodMeta[type].category === category && (methodTypeCounts[type] ?? 0) < 3,
                );
                if (availableTypes.length === 0) return null;
                return <section className="method-category" key={category}>
                  <h3>{category}</h3><div>
                    {availableTypes.map((type) => {
                      const meta = methodMeta[type];
                      return <button type="button" key={type} onClick={() => openMethod(type)}>
                        <span className="method-library-icon" style={{ color: previewTheme.backgroundColor }}>
                          {PHOSPHOR_METHOD_TYPES.has(type) ? <meta.Icon size={20} weight="bold" color={previewTheme.backgroundColor} /> : <meta.Icon size={20} color={previewTheme.backgroundColor} />}
                        </span>
                        <span className="method-library-label">{meta.name}</span>
                        <PlusIcon />
                      </button>;
                    })}
                  </div>
                </section>;
              })}
            </div>
          </section>
        </div>
      )}
      {showThemePicker && (
        <div className="method-library-sheet-backdrop" role="presentation" onClick={() => setShowThemePicker(false)}>
          <section className="method-library-sheet theme-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="theme-picker-title" onClick={(event) => event.stopPropagation()}>
            <header className="method-library-sheet-header">
              <div>
                <span className="theme-picker-current" aria-hidden="true" style={{ background: previewTheme.backgroundGradient }} />
                <div><h2 id="theme-picker-title">Card colour</h2><p>Choose the colour used across your card.</p></div>
              </div>
              <button type="button" aria-label="Close card colour sheet" onClick={() => setShowThemePicker(false)}><XIcon size={19} /></button>
            </header>
            <div className="theme-picker-sheet-content">
              <div className="theme-swatches theme-swatches--sheet">{themes.map((theme, index) => (
                <button
                  type="button"
                  key={theme}
                  aria-label={`Use card colour ${index + 1}`}
                  aria-pressed={draft.theme === theme}
                  className={draft.theme === theme ? "selected" : ""}
                  style={{ background: themeGradientCss(theme) }}
                  onClick={() => { update("theme", theme); setShowThemePicker(false); }}>
                  {draft.theme === theme ? <CheckIcon size={20} color={themeForegroundColor(theme)} /> : null}
                </button>
              ))}</div>
            </div>
          </section>
        </div>
      )}
      <section className="card-creator">
        <div className="creator-layout creator-layout--fill">
          <aside className="creator-preview">
            {hydrated && (
              <div className={`creator-publish-state ${isPublishedCard(draft) && !hasUnpublishedChanges ? "is-published" : "is-dirty"}`} role="status">
                {!hasUnpublishedChanges && isPublishedCard(draft) && <CheckCircleIcon size={18} />}
                <span>
                  {hasUnpublishedChanges
                    ? isCreating
                      ? "New card, not published yet."
                      : "Unpublished changes on this card."
                    : isPublishedCard(draft)
                      ? "Card published and up to date."
                      : "Draft loaded, not published yet."}
                </span>
              </div>
            )}
            <div className="creator-preview-head"><span>Live preview</span><small>Updates instantly</small></div>
            <article className="public-card public-card--editable">
              <input ref={photoInput} className="sr-only" type="file" accept="image/*" onChange={selectPhoto} />
              <input ref={logoInput} className="sr-only" type="file" accept="image/*" onChange={(event) => selectImage("companyLogo", event)} />
              <input ref={coverInput} className="sr-only" type="file" accept="image/*" onChange={(event) => selectImage("coverPhoto", event)} />
              <div
                className={`card-cover ${draft.coverPhoto ? "has-cover-photo" : ""}`}
                style={draft.coverPhoto
                  ? { backgroundImage: `linear-gradient(rgba(22,51,0,.18), rgba(22,51,0,.18)), url(${draft.coverPhoto})`, color: "#FFFFFF" }
                  : { background: previewTheme.backgroundGradient, color: previewTheme.color }}>
                <button
                  type="button"
                  className="image-edit-overlay"
                  title={draft.coverPhoto ? "Change cover photo" : "Add cover photo"}
                  aria-label={draft.coverPhoto ? "Change cover photo" : "Add cover photo"}
                  onClick={() => coverInput.current?.click()}
                >
                  <PencilSimpleIcon size={20} />
                </button>
                {showCompanyDetails ? <>
                  <div className="card-logo" style={draft.coverPhoto ? undefined : coverBadgeStyle}>
                    <CardImage src={draft.companyLogo} alt="" fallback={draft.company ? draft.company[0] : <BriefcaseIcon size={14} />} />
                    <button
                      type="button"
                      className="image-edit-overlay"
                      title={draft.companyLogo ? "Change company logo" : "Add company logo"}
                      aria-label={draft.companyLogo ? "Change company logo" : "Add company logo"}
                      onClick={() => logoInput.current?.click()}
                    >
                      <PencilSimpleIcon size={13} />
                    </button>
                  </div>
                  <InlineEditField
                    key={`${draft.id}-company`}
                    as="span"
                    style={draft.coverPhoto ? undefined : { color: previewTheme.color }}
                    defaultValue={draft.company}
                    onConfirm={(next) => update("company", next)}
                    placeholder="Your company"
                    ariaLabel="Company name"
                  />
                </> : null}
              </div>
              <div className="card-body">
                <div className="card-avatar" style={coverBadgeStyle}>
                  <CardImage src={draft.photo} alt="" fallback={initials} />
                  <button
                    type="button"
                    className="image-edit-overlay"
                    title={draft.photo ? "Change profile picture" : "Add profile picture"}
                    aria-label={draft.photo ? "Change profile picture" : "Add profile picture"}
                    onClick={() => photoInput.current?.click()}
                  >
                    <PencilSimpleIcon size={18} />
                  </button>
                </div>
                <InlineEditField
                  key={`${draft.id}-name`}
                  as="h2"
                  defaultValue={draft.name}
                  onConfirm={(next) => update("name", next)}
                  placeholder="Your name"
                  ariaLabel="Full name"
                />
                <InlineEditField
                  key={`${draft.id}-role`}
                  as="p"
                  className="card-role"
                  defaultValue={draft.role}
                  onConfirm={(next) => update("role", next)}
                  placeholder="Your role"
                  ariaLabel="Job title"
                  suffix={showCompanyDetails && draft.company ? ` · ${draft.company}` : null}
                />
                <InlineEditField
                  key={`${draft.id}-bio`}
                  as="p"
                  className="card-bio"
                  defaultValue={draft.bio}
                  onConfirm={(next) => update("bio", next)}
                  placeholder="About you"
                  ariaLabel="Short introduction"
                  multiline
                  maxLength={180}
                />
                {collapsedPreviewMethods.length > 0 ? <div className="preview-methods">{collapsedPreviewMethods.map((method) => {
                  const meta = methodMeta[method.type];
                  return <button
                    type="button"
                    key={method.id}
                    draggable
                    className={`${draggingMethodId === method.id ? "is-dragging" : ""}${dropTargetMethodId === method.id && draggingMethodId !== method.id ? " is-drop-target" : ""}`}
                    style={{ "--card-accent": previewTheme.backgroundColor } as React.CSSProperties}
                    onDragStart={(event) => {
                      methodDragRef.current = true;
                      setDraggingMethodId(method.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", method.id);
                    }}
                    onDragEnter={() => { if (draggingMethodId !== method.id) setDropTargetMethodId(method.id); }}
                    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                    onDrop={(event) => {
                      event.preventDefault();
                      moveMethod(event.dataTransfer.getData("text/plain") || draggingMethodId || "", method.id);
                      setDropTargetMethodId(null);
                    }}
                    onDragEnd={() => {
                      setDraggingMethodId(null);
                      setDropTargetMethodId(null);
                      window.setTimeout(() => { methodDragRef.current = false; }, 0);
                    }}
                    onKeyDown={(event) => {
                      if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                      event.preventDefault();
                      moveVisibleMethod(method.id, event.key === "ArrowUp" ? -1 : 1);
                    }}
                    onClick={() => {
                      if (methodDragRef.current) return;
                      setMethodError("");
                      setEditing(method);
                    }}
                    aria-label={`Edit ${method.label || meta.name}. Hold Alt and press the up or down arrow to reorder.`}
                  >
                      <i className="preview-method-grip" aria-hidden="true" />
                      <span style={{ color: previewTheme.backgroundColor }}>
                        {PHOSPHOR_METHOD_TYPES.has(method.type) ? <meta.Icon weight="bold" color={previewTheme.backgroundColor} /> : <meta.Icon color={previewTheme.backgroundColor} />}
                      </span>
                      <p><strong>{method.label}</strong><small>{method.value}</small></p>
                      <PencilSimpleIcon size={16} />
                    </button>;
                })}</div> : null}
                {editing && <section
                  className="preview-method-editor"
                  aria-label={`Edit ${methodMeta[editing.type].name}`}
                  onBlur={finishMethodEditing}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") { setMethodError(""); setEditing(null); }
                    if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); saveMethod(); }
                  }}
                >
                  <div className="preview-method-editor-content">
                    <div className="preview-method-suggestions" aria-label="Suggested labels">
                      {suggestionsFor(editing.type).map((label) => (
                        <button key={label} type="button" aria-pressed={editing.label === label} onClick={() => setEditing({ ...editing, label })}>{label}</button>
                      ))}
                    </div>
                    <input aria-label="Button label" placeholder="Button label" value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} />
                    <input
                      autoFocus
                      aria-label={fieldLabel(editing.type)}
                      placeholder={fieldLabel(editing.type)}
                      type={editing.type === "email" ? "email" : editing.type === "phone" || editing.type === "whatsapp" ? "tel" : "text"}
                      value={editing.value}
                      onChange={(event) => { setMethodError(""); setEditing({ ...editing, value: event.target.value }); }}
                    />
                    {methodError ? <small className="preview-method-error" role="alert">{methodError}</small> : null}
                    <div className="preview-method-mini-actions">
                      {draft.methods.some((item) => item.id === editing.id) ? (
                        <button type="button" className="preview-method-delete" onClick={() => { update("methods", draft.methods.filter((item) => item.id !== editing.id)); setMethodError(""); setEditing(null); }}>Delete</button>
                      ) : null}
                      <button type="button" className="preview-method-cancel" onClick={() => { setMethodError(""); setEditing(null); }}>Cancel</button>
                      <button type="button" className="preview-method-save" onClick={saveMethod}>Save</button>
                    </div>
                  </div>
                </section>}
              </div>
            </article>
          </aside>
          <section className="creator-workspace creator-workspace--fill">
            <div className="creator-section creator-section--fill">
              {isCreating ? <header><h1>Let&apos;s create your card.</h1><p>Add your identity, images, style and contact details - publish when it&apos;s ready so people can scan it.</p></header> : null}
              <div
                className={`company-visibility-option ${showCompanyDetails ? "is-enabled" : ""}`}
                style={showCompanyDetails ? { borderColor: previewTheme.backgroundColor, boxShadow: `0 8px 24px rgba(22,51,0,.08), inset 3px 0 0 ${previewTheme.backgroundColor}` } : undefined}
              >
                <span className="company-option-icon" aria-hidden="true" style={showCompanyDetails ? { color: previewTheme.backgroundColor } : undefined}><BriefcaseIcon size={19} /></span>
                <div className="company-option-copy">
                  <div><strong>Company details</strong><span style={showCompanyDetails ? { background: previewTheme.backgroundGradient, color: previewTheme.color } : undefined}>{showCompanyDetails ? "Shown" : "Hidden"}</span></div>
                  <p id="company-details-description">Show your company name, logo and website.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="Show company details"
                  aria-describedby="company-details-description"
                  aria-checked={showCompanyDetails}
                  className={`company-switch ${showCompanyDetails ? "is-on" : ""}`}
                  style={showCompanyDetails ? { background: previewTheme.backgroundGradient } : undefined}
                  onClick={() => update("showCompanyDetails", !showCompanyDetails)}
                >
                  <span aria-hidden="true" />
                </button>
              </div>
              <div className="theme-panel editor-desktop-only"><h2>Card colour</h2><p>Used for the cover and primary actions.</p>
                <div className="theme-swatches">{themes.map((theme, index) => (
                  <button
                    type="button"
                    key={theme}
                    aria-label={`Use card colour ${index + 1}`}
                    aria-pressed={draft.theme === theme}
                    className={draft.theme === theme ? "selected" : ""}
                    style={{ background: themeGradientCss(theme) }}
                    onClick={() => update("theme", theme)}>
                    {draft.theme === theme ? <CheckIcon size={16} color={themeForegroundColor(theme)} /> : null}
                  </button>
                ))}</div>
              </div>
              <button type="button" className="theme-picker-trigger editor-compact-only" onClick={() => setShowThemePicker(true)}>
                <span className="theme-picker-current" aria-hidden="true" style={{ background: previewTheme.backgroundGradient }} />
                <span><strong>Card colour</strong><small>Choose the colour used across your card.</small></span>
                <ChevronRightIcon size={18} aria-hidden="true" />
              </button>

              <div className="method-library editor-desktop-only">
                <header className="method-library-heading">
                  <span className="method-library-add-icon" aria-hidden="true" style={{ color: previewTheme.backgroundColor }}><PlusIcon size={18} /></span>
                  <div><h2>Add a contact method</h2><p>Choose how people can connect with you.</p></div>
                </header>
                {methodCategories.map((category) => {
                  const availableTypes = (Object.keys(methodMeta) as MethodType[]).filter(
                    (type) => methodMeta[type].category === category && (methodTypeCounts[type] ?? 0) < 3,
                  );
                  if (availableTypes.length === 0) return null;
                  return <section className="method-category" key={category}>
                    <h3>{category}</h3><div>
                      {availableTypes.map((type) => {
                        const meta = methodMeta[type];
                        return <button type="button" key={type} onClick={() => openMethod(type)}>
                          <span className="method-library-icon" style={{ color: previewTheme.backgroundColor }}>
                            {PHOSPHOR_METHOD_TYPES.has(type) ? <meta.Icon size={20} weight="bold" color={previewTheme.backgroundColor} /> : <meta.Icon size={20} color={previewTheme.backgroundColor} />}
                          </span>
                          <span className="method-library-label">{meta.name}</span>
                          <PlusIcon />
                        </button>;
                      })}
                    </div>
                  </section>;
                })}
              </div>
              <button type="button" className="method-library-trigger editor-compact-only" onClick={() => setShowMethodLibrary(true)}>
                <div className="method-library-heading">
                  <span className="method-library-add-icon" aria-hidden="true" style={{ color: previewTheme.backgroundColor }}><PlusIcon size={18} /></span>
                  <div><h2>Add a contact method</h2><p>Choose how people can connect with you.</p></div>
                </div>
                <PlusIcon className="method-library-trigger-action" size={18} aria-hidden="true" />
              </button>
            </div>

            {saveError && (
              <footer className="creator-actions creator-actions--fill">
                <p className="creator-save-error" role="alert">{saveError}</p>
              </footer>
            )}
          </section>

        </div>
      </section>

    </>
  );
}
