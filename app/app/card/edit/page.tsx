"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { ArrowRight as ArrowRightIcon } from "react-feather";
import { Calendar as CalendarBlankIcon } from "react-feather";
import { MessageCircle as ChatCircleDotsIcon } from "react-feather";
import { DollarSign as CurrencyDollarIcon } from "react-feather";
import { ChevronDown as CaretDownIcon } from "react-feather";
import { ChevronUp as CaretUpIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { Mail as EnvelopeSimpleIcon } from "react-feather";
import { Globe as GlobeIcon } from "react-feather";
import { DiscordLogoIcon } from "@phosphor-icons/react/dist/csr/DiscordLogo";
import { Facebook as FacebookLogoIcon } from "react-feather";
import { GitHub as GithubLogoIcon } from "react-feather";
import { Instagram as InstagramLogoIcon } from "react-feather";
import { Link as LinkIcon } from "react-feather";
import { Linkedin as LinkedinLogoIcon } from "react-feather";
import { MapPin as MapPinIcon } from "react-feather";
import { PaletteIcon } from "@phosphor-icons/react/dist/csr/Palette";
import { PaypalLogoIcon } from "@phosphor-icons/react/dist/csr/PaypalLogo";
import { Phone as PhoneIcon } from "react-feather";
import { Plus as PlusIcon } from "react-feather";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { SkypeLogoIcon } from "@phosphor-icons/react/dist/csr/SkypeLogo";
import { SnapchatLogoIcon } from "@phosphor-icons/react/dist/csr/SnapchatLogo";
import { Star as StarIcon } from "react-feather";
import { TelegramLogoIcon } from "@phosphor-icons/react/dist/csr/TelegramLogo";
import { ThreadsLogoIcon } from "@phosphor-icons/react/dist/csr/ThreadsLogo";
import { TiktokLogoIcon } from "@phosphor-icons/react/dist/csr/TiktokLogo";
import { Trash2 as TrashIcon } from "react-feather";
import { Twitch as TwitchLogoIcon } from "react-feather";
import { User as UserCircleIcon } from "react-feather";
import { WhatsappLogoIcon } from "@phosphor-icons/react/dist/csr/WhatsappLogo";
import { X as XIcon } from "react-feather";
import { XLogoIcon } from "@phosphor-icons/react/dist/csr/XLogo";
import { Youtube as YoutubeLogoIcon } from "react-feather";
import { useAppShellChrome } from "../../../components/AppShellChromeContext";
import { Button, IconButton, LinkButton } from "../../../components/Button";
import { TextAreaField, TextField } from "../../../components/FormField";
import { PhoneField } from "../../../components/PhoneField";
import { Check as CheckIcon } from "react-feather";
import { contactMethodHref, contactMethodOpensNewTab } from "../../../../lib/contact-methods";
import { themeCoverBadgeStyle, themeForegroundColor, themeGradientCss, themeSurfaceStyle } from "../../../../lib/theme-contrast";
import {
  cardPublishFingerprint,
  createLibraryCard,
  getActiveCardId,
  MAX_CARDS,
  readCardLibrary,
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

const methodMeta: Record<MethodType, { category: string; name: string; placeholder: string; label: string; Icon: ComponentType<any> }> = {
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

const initialDraft: CardDraft = {
  id: "primary-card",
  slug: "alex-morgan",
  createdAt: "",
  updatedAt: "",
  label: "My primary card",
  name: "Alex Morgan",
  role: "Independent Consultant",
  company: "Northstar Advisory",
  bio: "I help growing teams turn messy ideas into clear products people want.",
  theme: "#9fe870",
  photo: "",
  companyLogo: "",
  coverPhoto: "",
  showCompanyDetails: true,
  methods: [
    { id: "email", type: "email", value: "alex@example.com", label: "Work" },
    { id: "website", type: "website", value: "https://northstar.example", label: "Visit my website" },
  ],
};

const themes = ["#9fe870", "#ff6b5e", "#ff9f43", "#ffc107", "#14b8a6", "#2495e8", "#5146e5", "#a83df0", "#163300", "#aeb8aa"];
const steps = [
  { label: "Design card", Icon: UserCircleIcon },
  { label: "Contact methods", Icon: PlusIcon },
  { label: "Review", Icon: CheckCircleIcon },
];
const isPublishedCard = (card: CardDraft) => card.status === "published" || Boolean(card.publishedAt);

function isCreateFlow(search: string) {
  const params = new URLSearchParams(search);
  return params.get("new") === "1" || params.get("mode") === "create";
}

function loadDraft(search = "") {
  if (typeof window === "undefined") return initialDraft;
  try {
    let cards = readCardLibrary(localStorage);
    const params = new URLSearchParams(search);
    const requestedId = params.get("id");
    if (isCreateFlow(search) && cards.length < MAX_CARDS) {
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
      cards = upsertLibraryCard(localStorage, created);
      window.history.replaceState(null, "", `/app/card/edit?id=${created.id}`);
      setActiveCardId(localStorage, created.id);
      return created as CardDraft;
    }
    const requestedIdOrActive = requestedId || getActiveCardId(localStorage, cards);
    const selected = cards.find((card) => card.id === requestedIdOrActive) || cards[0];
    if (selected) {
      setActiveCardId(localStorage, selected.id);
      return { ...initialDraft, ...selected } as CardDraft;
    }
    const legacy = JSON.parse(localStorage.getItem("aftermeet-profile-v1") || "null");
    const photo = localStorage.getItem("aftermeet-profile-photo-v1") || "";
    if (legacy) {
      return {
        ...initialDraft, ...legacy, photo,
        methods: [
          { id: "email", type: "email", value: legacy.email || "", label: "Work" },
          { id: "website", type: "website", value: legacy.website || "", label: "Visit my website" },
        ],
      };
    }
  } catch {}
  return initialDraft;
}

export default function CardEditor() {
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<CardDraft>(initialDraft);
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const [publishedFingerprint, setPublishedFingerprint] = useState("");
  const [hasEditBaseline, setHasEditBaseline] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);
  const [editing, setEditing] = useState<ContactMethod | null>(null);
  const [methodError, setMethodError] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const hasUnpublishedRef = useRef(false);
  const pendingNavigationRef = useRef<null | (() => void)>(null);
  const suppressBeforeUnloadRef = useRef(false);

  useEffect(() => {
    const requestedSearch = searchString;
    void hydrateCardLibraryFromServer().then(() => {
      const loaded = loadDraft(requestedSearch);
      const activeSearch = typeof window === "undefined" ? requestedSearch : window.location.search;
      const requestedId = new URLSearchParams(activeSearch).get("id");
      const creatingFlow = isCreateFlow(activeSearch);
      setDraft(loaded);
      setPublishedFingerprint(cardPublishFingerprint(loaded));
      setHasEditBaseline(!creatingFlow);
      setSaved(isPublishedCard(loaded));
      if (creatingFlow || requestedId) {
        setStep(0);
        setIsCreating(creatingFlow);
      } else {
        setIsCreating(false);
        const storedStep = Number(localStorage.getItem("aftermeet-card-step-v2"));
        if (Number.isInteger(storedStep) && storedStep >= 0 && storedStep <= 2) setStep(storedStep);
      }
      setHydrated(true);
    }).catch(() => {
      const loaded = loadDraft(requestedSearch);
      const activeSearch = typeof window === "undefined" ? requestedSearch : window.location.search;
      const requestedId = new URLSearchParams(activeSearch).get("id");
      const creatingFlow = isCreateFlow(activeSearch);
      setDraft(loaded);
      setPublishedFingerprint(cardPublishFingerprint(loaded));
      setHasEditBaseline(!creatingFlow);
      setSaved(isPublishedCard(loaded));
      if (creatingFlow || requestedId) {
        setStep(0);
        setIsCreating(creatingFlow);
      } else {
        setIsCreating(false);
        const storedStep = Number(localStorage.getItem("aftermeet-card-step-v2"));
        if (Number.isInteger(storedStep) && storedStep >= 0 && storedStep <= 2) setStep(storedStep);
      }
      setHydrated(true);
    });
  }, [searchString]);

  const initials = draft.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const previewTheme = useMemo(() => themeSurfaceStyle(draft.theme), [draft.theme]);
  const coverBadgeStyle = useMemo(() => themeCoverBadgeStyle(draft.theme), [draft.theme]);
  const EditingMethodIcon: ComponentType<any> = editing ? methodMeta[editing.type].Icon : PlusIcon;
  const addedMethodTypes = new Set(draft.methods.map((method) => method.type));
  const showCompanyDetails = draft.showCompanyDetails !== false;
  const visibleMethods = showCompanyDetails
    ? draft.methods
    : draft.methods.filter((method) => method.type !== "website");
  const stepCompletion = [
    Boolean(draft.name.trim() && draft.role.trim() && draft.theme),
    draft.methods.length > 0,
    saved,
  ];
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
    upsertLibraryCard(localStorage, next);
    setActiveCardId(localStorage, next.id);
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

  const update = <K extends keyof CardDraft>(key: K, value: CardDraft[K]) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      persistDraft(next);
      return next;
    });
  };

  async function save() {
    persistDraft(draft);
    setPublishing(true);
    setSaveError("");
    try {
      const savedDraft = await flushCardSync(draft);
      if (!savedDraft) throw new Error("This card changed on another device. Reload the latest card before publishing again.");
      const response = await fetch("/api/cards/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...savedDraft, expectedUpdatedAt: savedDraft.updatedAt }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "We couldn’t publish this card.");
      const published = { ...savedDraft, updatedAt: result.updatedAt || savedDraft.updatedAt, status: "published" as const, publishedAt: new Date().toISOString() };
      setDraft(published);
      persistDraft(published);
      setPublishedFingerprint(cardPublishFingerprint(published));
      setHasEditBaseline(true);
      setIsCreating(false);
      setSaved(true);
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
    if (addedMethodTypes.has(type)) return;
    setMethodError("");
    setEditing({ id: crypto.randomUUID(), type, value: "", label: methodMeta[type].label });
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

  function moveMethod(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.methods.length) return;
    const methods = [...draft.methods];
    [methods[index], methods[nextIndex]] = [methods[nextIndex], methods[index]];
    update("methods", methods);
  }

  function goToStep(nextStep: number) {
    setStep(nextStep);
    localStorage.setItem("aftermeet-card-step-v2", String(nextStep));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const requestNavigation = useCallback((_href: string, proceed: () => void) => {
    if (!hasUnpublishedRef.current) {
      proceed();
      return;
    }
    pendingNavigationRef.current = proceed;
    setShowLeavePrompt(true);
  }, []);

  function continueFlow() {
    if (step === 2) { void save(); return; }
    goToStep(step + 1);
  }

  useAppShellChrome({
    backHref: "/app/cards",
    requestNavigation,
    actions: <Button size="small" loading={publishing} disabled={!hasUnpublishedChanges && saved} onClick={save}>{!hasUnpublishedChanges && saved ? <CheckCircleIcon /> : null}{publishLabel}</Button>,
  });

  const cancelNavigation = useCallback(() => {
    suppressBeforeUnloadRef.current = false;
    setShowLeavePrompt(false);
    pendingNavigationRef.current = null;
  }, []);

  function confirmNavigation() {
    const next = pendingNavigationRef.current;
    suppressBeforeUnloadRef.current = true;
    setShowLeavePrompt(false);
    pendingNavigationRef.current = null;
    next?.();
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
      if (event.key === "Escape") {
        cancelNavigation();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [shouldShowLeavePrompt, cancelNavigation]);

  return (
    <>
      {shouldShowLeavePrompt && (
        <div className="connections-modal-backdrop add-followup-modal-backdrop" role="presentation" onClick={cancelNavigation}>
          <section className="connections-modal" role="dialog" aria-modal="true" aria-labelledby="leave-card-editor-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2 id="leave-card-editor-title">Unsaved changes</h2>
              <button type="button" aria-label="Close leave prompt" onClick={cancelNavigation}><XIcon /></button>
            </header>
            <p>Are you sure you want to leave this page? Your progress will be lost if you don&apos;t save.</p>
            <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
              <Button size="small" variant="secondary" onClick={cancelNavigation}>Stay on page</Button>
              <Button size="small" onClick={confirmNavigation}>Leave without saving</Button>
            </div>
          </section>
        </div>
      )}
      <section className="card-creator">
        {hydrated && (
          <div className={`creator-publish-state ${hasUnpublishedChanges ? "is-dirty" : "is-published"}`} role="status">
            {hasUnpublishedChanges ? (
              isCreating
                ? <><span>New card</span><small>Saved as a draft on this device. Publish once it&apos;s ready so people can scan it.</small></>
                : <><span>Unpublished changes</span><small>Your edits are saved as a draft on this device. Publish when they are ready to appear on your public card.</small></>
            ) : isPublishedCard(draft)
              ? <><CheckCircleIcon size={18} /><span>Card is published</span><small>Your public card matches this editor.</small></>
              : <><span>Draft loaded</span><small>Publish this card when you&apos;re ready to share it publicly.</small></>}
          </div>
        )}
        <nav className="creator-steps" aria-label="Card creation progress">
          {steps.map(({ label, Icon }, index) => (
            <button
              key={label}
              type="button"
              aria-current={index === step ? "step" : undefined}
              className={index === step ? "active" : stepCompletion[index] ? "complete" : ""}
              onClick={() => goToStep(index)}
            >
              <span>{stepCompletion[index] && index !== step ? <CheckCircleIcon /> : <Icon />}</span>
              <small>Step {index + 1}</small><strong>{label}</strong>
            </button>
          ))}
        </nav>

        <div className="creator-layout">
          <aside className="creator-preview">
            <div className="creator-preview-head"><span>Live preview</span><small>Updates instantly</small></div>
            <article className="public-card">
              <div
                className={`card-cover ${draft.coverPhoto ? "has-cover-photo" : ""}`}
                style={draft.coverPhoto
                  ? { backgroundImage: `linear-gradient(rgba(22,51,0,.18), rgba(22,51,0,.18)), url(${draft.coverPhoto})`, color: "#FFFFFF" }
                  : { background: previewTheme.backgroundGradient, color: previewTheme.color }}>
                {showCompanyDetails && (draft.companyLogo || draft.company) ? <>
                  <div className="card-logo" style={draft.coverPhoto ? undefined : coverBadgeStyle}>
                    {draft.companyLogo ? <img src={draft.companyLogo} alt="" /> : draft.company[0] || "A"}
                  </div>
                  {draft.company ? <span style={draft.coverPhoto ? undefined : { color: previewTheme.color }}>{draft.company}</span> : null}
                </> : null}
              </div>
              <div className="card-body">
                <div className="card-avatar">{draft.photo ? <img src={draft.photo} alt="" /> : initials}</div>
                <h2>{draft.name || "Your name"}</h2><p className="card-role">{draft.role || "Your role"}{showCompanyDetails && draft.company && ` · ${draft.company}`}</p>
                <p className="card-bio">{draft.bio || "Your introduction will appear here."}</p>
                <div className="card-actions"><Button fullWidth style={{ background: previewTheme.backgroundGradient }}>Save contact</Button><Button fullWidth variant="secondary">Share details</Button></div>
                <div className="preview-methods">{visibleMethods.map((method) => {
                  const meta = methodMeta[method.type];
                  const href = contactMethodHref(method);
                  const content = (
                    <>
                      <span style={{ background: previewTheme.backgroundGradient, color: previewTheme.color }}>
                        {PHOSPHOR_METHOD_TYPES.has(method.type) ? <meta.Icon weight="bold" color={previewTheme.color} /> : <meta.Icon color={previewTheme.color} />}
                      </span>
                      <p><strong>{method.label}</strong><small>{method.value}</small></p>
                    </>
                  );
                  return href
                    ? <a key={method.id} href={href} target={contactMethodOpensNewTab(href) ? "_blank" : undefined} rel={contactMethodOpensNewTab(href) ? "noreferrer" : undefined} aria-label={`${method.label}: ${meta.name}`}>{content}</a>
                    : <div key={method.id}>{content}</div>;
                })}</div>
              </div>
            </article>
          </aside>
          <section className="creator-workspace">
            {step === 0 && (
              <div className="creator-section">
                <header><span>01 · Design card</span><h1>{isCreating ? "Let's create your card." : "Make your card recognisable and ready to share."}</h1><p>{isCreating ? "Start with your identity, images and visual style - you can fill in the rest later." : "Add your identity, images and visual style in one place."}</p></header>
                <div className="image-panel">
                  <div className="image-panel-heading"><div><h2>Card images</h2><p>Add a company logo, profile picture and cover photo.</p></div></div>
                  <input ref={photoInput} className="sr-only" type="file" accept="image/*" onChange={selectPhoto} />
                  <input ref={logoInput} className="sr-only" type="file" accept="image/*" onChange={(event) => selectImage("companyLogo", event)} />
                  <input ref={coverInput} className="sr-only" type="file" accept="image/*" onChange={(event) => selectImage("coverPhoto", event)} />
                  <div className="image-options">
                    <div className={draft.companyLogo ? "has-image" : ""}>
                      <button type="button" onClick={() => logoInput.current?.click()}>
                        {draft.companyLogo ? <img src={draft.companyLogo} alt="" /> : <PlusIcon />}
                        <span>{draft.companyLogo ? "Change logo" : "Company logo"}</span>
                      </button>
                      {draft.companyLogo && <button type="button" className="remove-image" onClick={() => update("companyLogo", "")}>Remove</button>}
                    </div>
                    <div className={draft.photo ? "has-image" : ""}>
                      <button type="button" onClick={() => photoInput.current?.click()}>
                        {draft.photo ? <img src={draft.photo} alt="" /> : <PlusIcon />}
                        <span>{draft.photo ? "Change picture" : "Profile picture"}</span>
                      </button>
                      {draft.photo && <button type="button" className="remove-image" onClick={() => update("photo", "")}>Remove</button>}
                    </div>
                    <div className={draft.coverPhoto ? "has-image" : ""}>
                      <button type="button" onClick={() => coverInput.current?.click()}>
                        {draft.coverPhoto ? <img src={draft.coverPhoto} alt="" /> : <PlusIcon />}
                        <span>{draft.coverPhoto ? "Change cover" : "Cover photo"}</span>
                      </button>
                      {draft.coverPhoto && <button type="button" className="remove-image" onClick={() => update("coverPhoto", "")}>Remove</button>}
                    </div>
                  </div>
                </div>
                <TextField label="Card label" hint="Private" value={draft.label} onChange={(e) => update("label", e.target.value)} />
                <div className="field-row two">
                  <TextField label="Full name" value={draft.name} onChange={(e) => update("name", e.target.value)} />
                  <TextField label="Job title" value={draft.role} onChange={(e) => update("role", e.target.value)} />
                </div>
                <TextField label="Company" value={draft.company} onChange={(e) => update("company", e.target.value)} />
                <TextAreaField label="Short introduction" hint={`${draft.bio.length}/180`} maxLength={180} rows={4} value={draft.bio} onChange={(e) => update("bio", e.target.value)} />
                <div className="theme-panel"><h2>Card colour</h2><p>Used for the cover and primary actions.</p>
                  <div className="theme-swatches">{themes.map((theme) => (
                    <button
                      type="button"
                      key={theme}
                      aria-label={`Use ${theme}`}
                      className={draft.theme === theme ? "selected" : ""}
                      style={{ background: themeGradientCss(theme) }}
                      onClick={() => update("theme", theme)}>
                      {draft.theme === theme ? <CheckIcon size={16} color={themeForegroundColor(theme)} /> : null}
                    </button>
                  ))}</div>
                </div>
                <div className="layout-choice selected"><div><strong>Focused</strong><p>Photo, identity, introduction, then contact methods.</p></div><CheckCircleIcon size={24} /></div>
                <div className="creator-note"><PaletteIcon weight="bold" /><p>More layouts can come later. The MVP uses one responsive layout that remains readable on every phone.</p></div>
              </div>
            )}

            {step === 1 && (
              <div className="creator-section">
                <header><span>02 · Contact methods</span><h1>Add only the ways you want people to respond.</h1><p>Each method can have a useful label and can be reordered.</p></header>
                <div className="method-list">
                  {draft.methods.map((method, index) => {
                    const meta = methodMeta[method.type];
                    return <article className="method-row" key={method.id}>
                      <span>{PHOSPHOR_METHOD_TYPES.has(method.type) ? <meta.Icon size={21} weight="bold" /> : <meta.Icon size={21} />}</span>
                      <button type="button" className="method-copy" onClick={() => { setMethodError(""); setEditing(method); }}><strong>{meta.name}</strong><p>{method.value}</p><small>{method.label}</small></button>
                      <div><IconButton aria-label={`Move ${meta.name} up`} disabled={index === 0} onClick={() => moveMethod(index, -1)}><CaretUpIcon /></IconButton>
                        <IconButton aria-label={`Move ${meta.name} down`} disabled={index === draft.methods.length - 1} onClick={() => moveMethod(index, 1)}><CaretDownIcon /></IconButton>
                        <IconButton aria-label={`Remove ${meta.name}`} onClick={() => update("methods", draft.methods.filter((item) => item.id !== method.id))}><TrashIcon /></IconButton></div>
                    </article>;
                  })}
                </div>
                {editing && <section className="method-inline-editor" aria-labelledby="method-title">
                  <header>
                    <div><span>{editing && PHOSPHOR_METHOD_TYPES.has(editing.type) ? <EditingMethodIcon weight="bold" /> : <EditingMethodIcon />}</span><div><small>{draft.methods.some((item) => item.id === editing.id) ? "Edit method" : "New method"}</small><h2 id="method-title">{methodMeta[editing.type].name}</h2></div></div>
                    <IconButton aria-label="Close editor" onClick={() => setEditing(null)}><XIcon /></IconButton>
                  </header>
                  <div className="method-inline-fields">
                    {editing.type === "phone" || editing.type === "whatsapp" ? (
                      <PhoneField
                        label={fieldLabel(editing.type)}
                        value={editing.value}
                        onChange={(value) => { setMethodError(""); setEditing({ ...editing, value }); }}
                        error={methodError}
                      />
                    ) : (
                      <TextField autoFocus label={fieldLabel(editing.type)} placeholder={methodMeta[editing.type].placeholder} value={editing.value} onChange={(e) => { setMethodError(""); setEditing({ ...editing, value: e.target.value }); }} error={methodError} />
                    )}
                    <TextField label="Display label" hint="Optional" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
                    <div><p>Suggested labels</p><div className="label-suggestions">{suggestionsFor(editing.type).map((label) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={editing.label === label}
                        className={editing.label === label ? "selected" : ""}
                        onClick={() => setEditing({ ...editing, label })}
                      >
                        {label}
                      </button>
                    ))}</div></div>
                  </div>
                  <footer><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={saveMethod}>Save method</Button></footer>
                </section>}
                <div className="method-library"><h2>Add a contact method</h2>
                  {methodCategories.map((category) => {
                    const availableTypes = (Object.keys(methodMeta) as MethodType[]).filter(
                      (type) => methodMeta[type].category === category && !addedMethodTypes.has(type),
                    );
                    if (availableTypes.length === 0) return null;
                    return <section className="method-category" key={category}>
                    <h3>{category}</h3><div>
                      {availableTypes.map((type) => {
                        const meta = methodMeta[type];
                        return <button type="button" key={type} onClick={() => openMethod(type)}>{PHOSPHOR_METHOD_TYPES.has(type) ? <meta.Icon size={24} weight="bold" /> : <meta.Icon size={24} />}<span>{meta.name}</span><PlusIcon /></button>;
                      })}
                    </div>
                  </section>;
                  })}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="creator-section review-section">
                <header><span>03 · Review</span><h1>{isCreating ? "Your new card is ready." : "Your card is ready to share."}</h1><p>{isCreating ? "Check the preview, then publish it so people can start scanning your QR." : "Check the preview, save it, then open the QR sharing screen."}</p></header>
                <div className="review-list">
                  <div><CheckCircleIcon /><span><strong>Identity</strong><small>{draft.name || "Name needed"} · {draft.role || "Job title needed"}{showCompanyDetails && draft.company ? ` · ${draft.company}` : ""}</small></span><button type="button" onClick={() => goToStep(0)}>Edit</button></div>
                  <div><CheckCircleIcon /><span><strong>Images and style</strong><small>{[draft.photo && "profile", draft.companyLogo && "logo", draft.coverPhoto && "cover"].filter(Boolean).join(", ") || "No images"} · {draft.theme} · Focused layout</small></span><button type="button" onClick={() => goToStep(0)}>Edit</button></div>
                  <div><CheckCircleIcon /><span><strong>Contact methods</strong><small>{draft.methods.length} added · {draft.methods.map((method) => methodMeta[method.type].name).join(", ") || "None"}</small></span><button type="button" onClick={() => goToStep(1)}>Edit</button></div>
                </div>
                <div className="company-visibility-option">
                  <span>
                    <strong>Company details</strong>
                    <small>Show your logo, company name, and company website on the card</small>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Show company details"
                    aria-checked={showCompanyDetails}
                    className={`company-switch ${showCompanyDetails ? "is-on" : ""}`}
                    onClick={() => update("showCompanyDetails", !showCompanyDetails)}
                  >
                    <span />
                  </button>
                </div>
                <LinkButton fullWidth variant="secondary" href="/app/cards"><QrCodeIcon weight="bold" /> Open card and QR</LinkButton>
              </div>
            )}

            <footer className="creator-actions">
              {saveError ? <p className="creator-save-error" role="alert">{saveError}</p> : null}
              <Button variant="ghost" disabled={step === 0} onClick={() => goToStep(step - 1)}><ArrowLeftIcon /> Back</Button>
              <Button loading={publishing} disabled={step === 2 && !hasUnpublishedChanges && saved} onClick={continueFlow}>{step === 2 ? publishLabel : "Continue"} {step < 2 && <ArrowRightIcon />}</Button>
            </footer>
          </section>

        </div>
      </section>

    </>
  );
}
