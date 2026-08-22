"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { ArrowRight as ArrowRightIcon } from "react-feather";
import { MoreHorizontal as MoreHorizontalIcon } from "react-feather";
import { X as XIcon } from "react-feather";
import { Copy as CopyIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { Download as DownloadSimpleIcon } from "react-feather";
import { Monitor as MonitorIcon } from "react-feather";
import { Watch as WatchIcon } from "react-feather";
import { Mail as EnvelopeSimpleIcon } from "react-feather";
import { Phone as PhoneIcon } from "react-feather";
import { Edit2 as PencilSimpleIcon } from "react-feather";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { ExternalLink as ArrowSquareOutIcon } from "react-feather";
import { Plus as PlusIcon } from "react-feather";
import { Trash2 as TrashIcon } from "react-feather";
import { Smartphone as DeviceMobileIcon } from "react-feather";
import { CreditCard as IdentificationCardIcon } from "react-feather";
import { ChevronDown as CaretDownIcon } from "react-feather";
import { ChevronUp as CaretUpIcon } from "react-feather";
import { ShareCardModal } from "../../components/ShareCardModal";
import { Upload as UploadSimpleIcon } from "react-feather";
import { useAppUser } from "../../components/AppUserContext";
import { CardFlowSkeleton } from "../../components/AsyncState";
import { CardImage } from "../../components/CardImage";
import { Button, LinkButton } from "../../components/Button";
import { ContactMethodIcon } from "../../components/ContactMethodIcon";
import { contactMethodHref, contactMethodOpensNewTab } from "../../../lib/contact-methods";
import { filterMethodsForCompanyVisibility, showsCompanyDetails } from "../../../lib/card-company-display";
import { buildHtmlSignature, buildPlainSignature } from "../../../lib/email-signature";
import { WidgetsOnPhoneModal } from "../../components/WidgetsOnPhoneModal";
import { WalletSharePanel } from "../../components/WalletSharePanel";
import { useToast } from "../../components/ToastContext";
import {
  cardDisplayLabel,
  cardInitials,
  cardLeadDetail,
  createLibraryCard,
  getActiveCardId,
  type LibraryCard,
  MAX_CARDS,
  readCardLibrary,
  removeLibraryCard,
  setActiveCardId,
  upsertLibraryCard,
} from "../../../lib/card-library";
import { themeCoverBadgeStyle, themeSurfaceStyle } from "../../../lib/theme-contrast";
import { deleteCardFromServer, hydrateCardLibraryFromServer, queueCardSync } from "../../../lib/card-library-sync";
import { applyCardTemplate } from "../../../lib/card-templates";
import type { CardTemplate } from "../../../lib/workspace/types";
import {
  enrichConnectionPhotos,
  fetchAllConnectionsMerged,
  sortConnections,
  type ConnectionItem,
} from "../../../lib/connections";

type Profile = LibraryCard & { email: string; website: string };
type ShareTool = "qr" | "signature" | "background" | "watch" | "widgets" | "wallet";
type QrSource = "branded" | "fallback" | "none";

function normalizeImageSource(value?: string) {
  return value?.trim() || "";
}

function parseDownloadFilename(contentDisposition: string | null) {
  if (!contentDisposition) return null;

  const utf8Match = /filename\*=(?:UTF-8''|utf-8'')([^;]+)/i.exec(contentDisposition);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1].trim().replace(/\"/g, ""));
  }

  const quotedMatch = /filename="([^"]+)"/i.exec(contentDisposition);
  if (quotedMatch?.[1]) return quotedMatch[1];

  const unquotedMatch = /filename=([^;\s]+)/i.exec(contentDisposition);
  return unquotedMatch?.[1] ?? null;
}

function isRenderableQrSource(value: string) {
  if (!value) return false;
  return value.startsWith("data:")
    || value.startsWith("http://")
    || value.startsWith("https://")
    || value.startsWith("blob:")
    || value.startsWith("/");
}

const fallback: Profile = {
  id: "primary-card", slug: "alex-morgan", label: "My primary card",
  name: "Alex Morgan", role: "Independent Consultant", company: "Northstar Advisory",
  bio: "I help growing teams turn messy ideas into clear products people want.",
  email: "alex@example.com", website: "https://northstar.example", theme: "#9fe870", photo: "", companyLogo: "", coverPhoto: "",
  createdAt: "", updatedAt: "",
  methods: [
    { id: "email", type: "email", value: "alex@example.com", label: "Work" },
    { id: "website", type: "website", value: "https://northstar.example", label: "Visit my website" },
  ],
};

export default function CardsPage() {
  const router = useRouter();
  const user = useAppUser();
  const [profile, setProfile] = useState(fallback);
  const [cards, setCards] = useState<LibraryCard[]>([]);
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [isTeamWorkspace, setIsTeamWorkspace] = useState(false);
  const [activeId, setActiveId] = useState(fallback.id);
  const [photo, setPhoto] = useState("");
  const [qr, setQr] = useState("");
  const [qrFallback, setQrFallback] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [qrSource, setQrSource] = useState<QrSource>("none");
  const [qrMode, setQrMode] = useState<"online" | "offline">("online");
  const [copied, setCopied] = useState(false);
  const [svgCopied, setSvgCopied] = useState(false);
  const [signatureCopied, setSignatureCopied] = useState<"" | "plain" | "html">("");
  const [showWidgetHelp, setShowWidgetHelp] = useState(false);
  const [widgetsOnPhoneOpen, setWidgetsOnPhoneOpen] = useState(false);
  const [viewingCard, setViewingCard] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [qrError, setQrError] = useState("");
  const [shareUrl, setShareUrl] = useState("http://localhost:3000/c/alex-morgan");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [cardActionsOpen, setCardActionsOpen] = useState(false);
  const [deletingCard, setDeletingCard] = useState(false);
  const [shareTool, setShareTool] = useState<ShareTool>("qr");
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileToolSelected, setMobileToolSelected] = useState(false);
  const [recentConnection, setRecentConnection] = useState<ConnectionItem | null>(null);
  const { showToast } = useToast();
  const cardTheme = useMemo(() => themeSurfaceStyle(profile.theme), [profile.theme]);
  const profilePhoto = normalizeImageSource(profile.photo || photo);
  const companyLogo = normalizeImageSource(profile.companyLogo);
  const coverPhoto = normalizeImageSource(profile.coverPhoto);
  const showCompanyDetails = showsCompanyDetails(profile);

  function toProfile(card: LibraryCard): Profile {
    return {
      ...card,
      email: card.methods.find((item) => item.type === "email")?.value || "",
      website: card.methods.find((item) => item.type === "website")?.value || "",
    };
  }

  function applyLibrary(library: LibraryCard[], preferredId = activeId) {
    if (!library.length) {
      setCards([]);
      setViewingCard(false);
      return;
    }
    const requestedId = new URLSearchParams(window.location.search).get("id");
    const selected = library.find((card) => card.id === requestedId)
      || library.find((card) => card.id === preferredId)
      || library.find((card) => card.id === getActiveCardId(localStorage, library))
      || library[0];
    setCards(library);
    setActiveId(selected.id);
    setProfile(toProfile(selected));
    setPhoto(selected.photo || "");
    setShareUrl(`${window.location.origin}/c/${selected.slug}`);
    if (requestedId && library.some((card) => card.id === requestedId)) {
      setViewingCard(true);
    }
  }

  const loadRecentConnection = useCallback(async () => {
    try {
      const merged = await fetchAllConnectionsMerged();
      const sorted = sortConnections(merged, "date");
      const latest = sorted[0];
      if (!latest) {
        setRecentConnection(null);
        return;
      }

      const enriched = await enrichConnectionPhotos([latest]);
      setRecentConnection(enriched[0] || latest);
    } catch {
      setRecentConnection(null);
    }
  }, []);

  function showQrError(message: string, action?: { label: string; onClick: () => void }) {
    showToast({
      tone: "error",
      message,
      action,
      durationMs: 6000,
    });
  }

  async function buildQrAssets() {
    if (!profile.slug) {
      setQr("");
      setQrSvg("");
      setQrFallback("");
      setQrSource("none");
      setQrError("");
      return;
    }

    const options = {
      width: 900,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#163300", light: "#ffffff" },
    } as const;

    setQr("");
    setQrSvg("");
    setQrFallback("");
    setQrSource("none");
    setQrError("");

    try {
      const [image, svg] = await Promise.all([
      fetch(`/api/cards/share-assets/${encodeURIComponent(profile.slug)}?type=branded-qr&size=900&mode=${qrMode}`)
        .then(async (response) => {
          if (!response.ok) return null;
          const payload = await response.json() as { dataUri?: string };
          const dataUri = normalizeImageSource(payload.dataUri);
          return isRenderableQrSource(dataUri) ? dataUri : null;
        })
        .catch(() => null),
      QRCode.toString(shareUrl, { ...options, type: "svg" }),
    ]);

      const svgDataUri = svg ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` : "";
      setQrFallback(svgDataUri);
      if (image) {
        setQr(image);
        setQrSource("branded");
      } else if (svgDataUri) {
        setQr(svgDataUri);
        setQrSource("fallback");
      } else {
        setQr("");
        setQrSource("none");
      }
      setQrSvg(svg);
    } catch (caught) {
      const message = caught instanceof Error
        ? caught.message
        : "We couldn’t generate this QR code. Check the card link and try again.";
      setQrError(message);
      showQrError(message, {
        label: "Try again",
        onClick: () => {
          void buildQrAssets();
        },
      });
    }
  }

  useEffect(() => {
    void fetch("/api/workspace")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as {
          active?: { type?: string };
          templates?: CardTemplate[];
        };
        setIsTeamWorkspace(payload.active?.type === "team");
        setTemplates(payload.templates ?? []);
      })
      .catch(() => undefined);

    void hydrateCardLibraryFromServer().then((library) => {
      if (!library.length) {
        setCards([]);
        setViewingCard(false);
        setHydrated(true);
        return;
      }
      applyLibrary(library);
      setHydrated(true);
    }).catch(() => {
      const message = "We couldn’t load your saved cards. Refresh the page to try again.";
      setQrError(message);
      showQrError(message, {
        label: "Reload",
        onClick: () => {
          window.location.reload();
        },
      });
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    function refreshFromServer() {
      if (document.visibilityState === "hidden") return;
      void hydrateCardLibraryFromServer()
        .then((library) => applyLibrary(library))
        .catch(() => {
          try {
            applyLibrary(readCardLibrary(localStorage));
          } catch {
            // Keep the current view if neither server nor cache can be read.
          }
        });
      void loadRecentConnection();
    }

    window.addEventListener("focus", refreshFromServer);
    document.addEventListener("visibilitychange", refreshFromServer);
    void refreshFromServer();
    const interval = window.setInterval(refreshFromServer, 30_000);
    return () => {
      window.removeEventListener("focus", refreshFromServer);
      document.removeEventListener("visibilitychange", refreshFromServer);
      window.clearInterval(interval);
    };
  }, [activeId, loadRecentConnection]);

  useEffect(() => {
    void buildQrAssets();
  }, [profile.slug, shareUrl, qrMode]);

  function handleQrImageError() {
    if (qrSource === "branded" && qrFallback && qr !== qrFallback) {
      setQrSource("fallback");
      setQr(qrFallback);
      setQrError("");
      return;
    }
    setQrSource("none");
    setQr("");
  }

  function selectCard(card: LibraryCard) {
    setActiveCardId(localStorage, card.id);
    setActiveId(card.id);
    setProfile(toProfile(card));
    setPhoto(card.photo || "");
    setShareUrl(`${window.location.origin}/c/${card.slug}`);
  }

  function openCard(card: LibraryCard) {
    selectCard(card);
    setViewingCard(true);
    window.history.pushState(null, "", `/app/cards?id=${card.id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showCardLibrary() {
    setViewingCard(false);
    setShowWidgetHelp(false);
    window.history.pushState(null, "", "/app/cards");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

function createCard(seed: Partial<LibraryCard> = {}) {
    // Re-read storage rather than trusting this component's `cards` state,
    // which can be stale relative to another tab or a recent sync.
    if (readCardLibrary(localStorage).length >= MAX_CARDS) {
      showToast({ tone: "error", message: "You’ve reached the card limit. Delete a card first, then create a new one." });
      return;
    }
  if (Object.keys(seed).length > 0) {
      const card = createLibraryCard({
        label: `Card ${cards.length + 1}`,
        theme: ["#9fe870", "#2495e8", "#ff9f43", "#a83df0", "#14b8a6"][cards.length],
        ...seed,
      });
      upsertLibraryCard(localStorage, card);
      queueCardSync(card);
      router.push(`/app/card/edit?id=${card.id}`);
      return;
    }
    // Hard navigation: this route can be reached from an existing
    // /app/card/edit?id=... visit without a full unmount (same page
    // component, only the query string changes), which was letting stale
    // "editing" state leak into the first paint of the create flow. A full
    // page load guarantees CardEditor mounts fresh with no prior state.
    window.location.href = `/app/card/edit?mode=create&new=1`;
  }

  function createCardFromTemplate(template: CardTemplate) {
    if (readCardLibrary(localStorage).length >= MAX_CARDS) {
      showToast({ tone: "error", message: "You’ve reached the card limit. Delete a card first, then create a new one." });
      return;
    }
    const card = applyCardTemplate(template, {
      memberName: user.displayName || "",
      memberEmail: user.email,
      label: template.name,
    });
    upsertLibraryCard(localStorage, card);
    queueCardSync(card);
    router.push(`/app/card/edit?id=${card.id}`);
  }

  async function deleteActiveCard() {
    if (deletingCard) return;
    if (!window.confirm(`Delete “${profile.label}”? This cannot be undone.`)) return;
    setDeletingCard(true);
    const result = await deleteCardFromServer(activeId);
    if (!result.ok) {
      setDeletingCard(false);
      showToast({ tone: "error", message: result.error });
      return;
    }

    const deletedLabel = profile.label;
    const next = removeLibraryCard(localStorage, activeId);
    setCards(next);
    setViewingCard(false);
    window.history.replaceState(null, "", "/app/cards");
    showToast({ tone: "success", message: `"${deletedLabel}" deleted.` });
    if (next[0]) selectCard(next[0]);
    setDeletingCard(false);
  }

  async function downloadShareAsset(type: "virtual-background" | "watch-face", mirrored = false) {
    try {
      const query = `type=${type}${mirrored ? "&mirrored=1" : ""}`;
      const response = await fetch(`/api/cards/share-assets/${encodeURIComponent(profile.slug)}?${query}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "We couldn’t download this asset.");
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        throw new Error("The server returned an invalid image file.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      const contentDisposition = response.headers.get("content-disposition");
      link.download = parseDownloadFilename(contentDisposition)
        || `ehllo-${type}-${profile.slug}${mirrored ? "-mirrored" : ""}` + (type === "virtual-background" ? ".jpg" : ".png");
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(href);
      }, 1500);
      showToast({
        tone: "success",
        message: type === "watch-face"
          ? "Watch QR downloaded."
          : mirrored
            ? "Mirrored background downloaded — reads correctly in your own self-view."
            : "Background downloaded.",
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "We couldn’t download this asset.";
      showQrError(message, {
        label: "Try again",
        onClick: () => {
          void downloadShareAsset(type);
        },
      });
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast({ tone: "success", message: "Card link copied." });
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      showToast({ tone: "error", message: "Could not copy the card link." });
    }
  }

  async function copySvg() {
    try {
      await navigator.clipboard.writeText(qrSvg);
      setSvgCopied(true);
      showToast({ tone: "success", message: "QR SVG copied to clipboard." });
      window.setTimeout(() => setSvgCopied(false), 1400);
    } catch {
      showToast({ tone: "error", message: "Could not copy the QR SVG." });
    }
  }

  async function copySignature(format: "plain" | "html") {
    try {
      const email = profile.methods.find((method) => method.type === "email")?.value || profile.email;
      const phone = profile.methods.find((method) => method.type === "phone")?.value;
      const signatureProfile = {
        name: profile.name,
        role: profile.role,
        company: profile.company,
        cardUrl: shareUrl,
        showCompany: profile.showCompanyDetails !== false,
        photoUrl: profile.photo,
        email,
        phone,
        themeColor: profile.theme,
      };
      let qrDataUri: string | undefined;
      if (format === "html" && profile.slug) {
        try {
          const response = await fetch(`/api/cards/share-assets/${encodeURIComponent(profile.slug)}?type=branded-qr&size=512`);
          if (response.ok) {
            const payload = await response.json() as { dataUri?: string };
            qrDataUri = payload.dataUri;
          }
        } catch {
          qrDataUri = undefined;
        }
      }
      const payload = format === "plain"
        ? buildPlainSignature(signatureProfile)
        : buildHtmlSignature({ ...signatureProfile, qrDataUri });
      await navigator.clipboard.writeText(payload);
      setSignatureCopied(format);
      showToast({ tone: "success", message: `${format === "plain" ? "Plain" : "HTML"} signature copied.` });
      window.setTimeout(() => setSignatureCopied(""), 1400);
    } catch {
      showToast({ tone: "error", message: "Could not copy the email signature." });
    }
  }

  function openInApp() {
    window.location.href = `ehllo://share-card?slug=${encodeURIComponent(profile.slug)}`;
  }

  const initials = profile.name.split(" ").map((word) => word[0]).join("").slice(0, 2);
  const profileActionMethods = profile.methods.length
    ? profile.methods
    : [
        { id: "legacy-email", type: "email", value: profile.email, label: "Email" },
        { id: "legacy-website", type: "website", value: profile.website, label: "Website" },
      ].filter((method) => method.value);
  const actionMethods = filterMethodsForCompanyVisibility(profileActionMethods, showCompanyDetails);

  return (
    <>
      <div className={`flow-page${hydrated && viewingCard ? " card-detail-page" : ""}`}>
        {!hydrated ? <CardFlowSkeleton /> : !cards.length ? (
          <section className="cards-empty-state">
            <div className="cards-empty-visual"><div><QrCodeIcon size={42} weight="bold" /></div><span><PlusIcon size={22} /></span></div>
            <h1>Create a card people can remember.</h1>
            <p>Add your identity and the ways people can reach you. ehllo creates the QR code when you save the card.</p>
            <Button onClick={() => createCard()}><PlusIcon size={18} /> Create your first card</Button>
            {isTeamWorkspace && templates.length ? (
              <div className="team-template-picker">
                <p>Or start from an org template:</p>
                <div className="team-template-picker-actions">
                  {templates.map((template) => (
                    <Button key={template.id} variant="secondary" onClick={() => createCardFromTemplate(template)}>
                      {template.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <small>You can create up to five cards for different roles, businesses, or occasions.</small>
          </section>
        ) : !viewingCard ? (
          <>
            <div className="flow-heading"><div><h1>Choose a card to open.</h1><p>Open a card to see its details, QR code, sharing tools, and phone widget options.</p></div></div>
            <section className="card-library-overview" aria-label="Your cards">
              <header><div><h2>Your cards</h2><p>{cards.length} of {MAX_CARDS} created</p></div></header>
              <div className="card-overview-grid">
                {cards.map((card) => (
                  <article key={card.id} className="card-overview-item">
                    <button onClick={() => openCard(card)} type="button">
                      <div className="card-overview-cover-wrap">
                        <div className="card-overview-cover-fallback" style={{ background: themeSurfaceStyle(card.theme).backgroundGradient }} />
                        <CardImage src={card.coverPhoto} alt="" className="card-overview-cover-photo" />
                        <div className="card-overview-avatar" style={themeCoverBadgeStyle(card.theme)}>
                          <span className="card-overview-avatar-fallback">{cardInitials(card.name)}</span>
                          <CardImage src={card.photo} alt="" className="card-overview-avatar-photo" />
                        </div>
                      </div>
                      <div className="card-overview-copy"><small>{cardDisplayLabel(card)}</small><h3>{card.name.trim() || "Add your full name"}</h3><p>{cardLeadDetail(card)}</p></div>
                    </button>
                  </article>
                ))}
                {cards.length < MAX_CARDS && <button className="card-overview-add" onClick={() => createCard()} type="button"><span><PlusIcon size={24} /></span><strong>Create another card</strong><small>{MAX_CARDS - cards.length} remaining</small></button>}
              </div>
              {isTeamWorkspace && templates.length ? (
                <div className="team-template-picker">
                  <p>Create a member card from an org template:</p>
                  <div className="team-template-picker-actions">
                    {templates.map((template) => (
                      <Button key={template.id} variant="secondary" onClick={() => createCardFromTemplate(template)}>
                        {template.name}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <>
            <div className="card-detail-topbar">
              <Button className="card-detail-back" size="small" variant="ghost" aria-label="All cards" onClick={showCardLibrary}><ArrowLeftIcon size={16} /><span>All cards</span></Button>
              <div className="card-detail-title"><span>Viewing</span><strong>{profile.label}</strong></div>
              <div className="card-detail-actions">
                <LinkButton size="small" variant="secondary" href={`/app/card/edit?id=${activeId}`}>
                  <PencilSimpleIcon size={16} /><span className="card-action-label-full">Edit card</span><span className="card-action-label-compact">Edit</span>
                </LinkButton>
                <Button size="small" variant="secondary" onClick={() => setShareModalOpen(true)}>
                  <UploadSimpleIcon size={16} /><span className="card-action-label-full">Share card</span><span className="card-action-label-compact">Share</span>
                </Button>
                <Button size="small" variant="ghost" loading={deletingCard} onClick={deleteActiveCard}>
                  <TrashIcon size={16} /> {deletingCard ? "Deleting…" : "Delete"}
                </Button>
              </div>
              <button className="card-detail-more" type="button" aria-label="More card actions" aria-expanded={cardActionsOpen} onClick={() => setCardActionsOpen(true)}><MoreHorizontalIcon size={19} /></button>
            </div>
            <div className="card-share-layout" id="share">
          <article className="share-card-preview" style={{ "--card-accent": cardTheme.backgroundColor } as React.CSSProperties}>
            <div className="share-card-cover" style={{ background: cardTheme.backgroundGradient, color: cardTheme.color }}>
              <CardImage src={coverPhoto} alt="" className="share-card-cover-photo" />
              {showCompanyDetails ? <>
                <span style={themeCoverBadgeStyle(profile.theme)}>{profile.company[0] || "A"}<CardImage src={companyLogo} alt="" /></span>
                <strong style={{ color: coverPhoto ? "#FFFFFF" : cardTheme.color }}>{profile.company || "Your company"}</strong>
              </> : null}
            </div>
            <div className="share-card-body">
              <div className="share-avatar" style={themeCoverBadgeStyle(profile.theme)}><span>{initials}</span><CardImage src={profilePhoto} alt={profile.name || "Profile picture"} /></div>
              <h2>{profile.name}</h2>
              <p className="share-role">{profile.role}{showCompanyDetails && profile.company ? ` · ${profile.company}` : ""}</p>
              {profile.bio ? <p className="share-bio">{profile.bio}</p> : null}
              <div className="share-contact">
                {actionMethods.map((method) => {
                  const href = contactMethodHref(method);
                  return href
                    ? <a key={method.id} href={href} target={contactMethodOpensNewTab(href) ? "_blank" : undefined} rel={contactMethodOpensNewTab(href) ? "noreferrer" : undefined}>
                        <span className="share-contact-icon" style={{ color: cardTheme.backgroundColor }}>
                          <ContactMethodIcon type={method.type} color={cardTheme.backgroundColor} size={18} />
                        </span>
                        <span className="share-contact-copy"><strong>{method.label}</strong><small>{method.value}</small></span>
                        <ArrowSquareOutIcon className="share-contact-action" size={17} aria-hidden="true" />
                      </a>
                    : <span className="unavailable-method" key={method.id}>
                        <span className="share-contact-icon" style={{ color: cardTheme.backgroundColor }}>
                          <ContactMethodIcon type={method.type} color={cardTheme.backgroundColor} size={18} />
                        </span>
                        <span className="share-contact-copy"><strong>{method.label}</strong><small>{method.value}</small></span>
                      </span>;
                })}
              </div>
            </div>
          </article>
          <Button className="card-tools-mobile-trigger" variant="secondary" onClick={() => { setMobileToolSelected(false); setMobileToolsOpen(true); }}><MoreHorizontalIcon size={18} /> Do more</Button>
          <div className={`card-tools-sheet-shell${mobileToolsOpen ? " open" : ""}${mobileToolSelected ? " tool-selected" : ""}`} role={mobileToolsOpen ? "presentation" : undefined} onClick={(event) => { if (event.target === event.currentTarget) setMobileToolsOpen(false); }}>
          <section className="inline-qr-panel" role={mobileToolsOpen ? "dialog" : undefined} aria-modal={mobileToolsOpen || undefined} aria-label={mobileToolsOpen ? "Card tools" : undefined}>
            <header className="card-tools-mobile-header">
              {mobileToolSelected ? <button type="button" aria-label="Back to card tools" onClick={() => setMobileToolSelected(false)}><ArrowLeftIcon size={17} /></button> : <span />}
              <div><small>{mobileToolSelected ? "Card tool" : "Do more"}</small><strong>{mobileToolSelected ? ([
                ["qr", "QR code"], ["signature", "Email signature"], ["background", "Virtual background"],
                ["watch", "Watch"], ["widgets", "Widgets"], ["wallet", "Wallet & NFC"],
              ] as const).find(([id]) => id === shareTool)?.[1] : "Choose what you want to use"}</strong></div>
              <button type="button" aria-label="Close card tools" onClick={() => setMobileToolsOpen(false)}><XIcon size={18} /></button>
            </header>
            <div className="card-tools-mobile-list">
              <button type="button" onClick={() => { setShareTool("qr"); setMobileToolSelected(true); }}><span><QrCodeIcon size={18} weight="bold" /></span><strong>QR code</strong><ArrowRightIcon size={16} /></button>
              <button type="button" onClick={() => { setShareTool("signature"); setMobileToolSelected(true); }}><span><EnvelopeSimpleIcon size={18} /></span><strong>Email signature</strong><ArrowRightIcon size={16} /></button>
              <button type="button" onClick={() => { setShareTool("background"); setMobileToolSelected(true); }}><span><MonitorIcon size={18} /></span><strong>Virtual background</strong><ArrowRightIcon size={16} /></button>
              <button type="button" onClick={() => { setShareTool("watch"); setMobileToolSelected(true); }}><span><WatchIcon size={18} /></span><strong>Watch</strong><ArrowRightIcon size={16} /></button>
              <button type="button" onClick={() => { setShareTool("widgets"); setMobileToolSelected(true); }}><span><DeviceMobileIcon size={18} /></span><strong>Widgets</strong><ArrowRightIcon size={16} /></button>
              <button type="button" onClick={() => { setShareTool("wallet"); setMobileToolSelected(true); }}><span><IdentificationCardIcon size={18} /></span><strong>Wallet &amp; NFC</strong><ArrowRightIcon size={16} /></button>
            </div>
            <div className="card-tools-tabs review-tabs" role="tablist" aria-label="Card sharing tools">
            {([
                ["qr", "QR code"],
                ["signature", "Email signature"],
                ["background", "Virtual background"],
                ["watch", "Watch"],
                ["widgets", "Widgets"],
                ["wallet", "Wallet & NFC"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={shareTool === id}
                  className={shareTool === id ? "active" : ""}
                  onClick={() => setShareTool(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="card-tool-content review-tab-panel" role="tabpanel">
            {shareTool === "qr" ? <section className="card-tool-section card-tool-qr-section">
            <div className="inline-qr-head"><span><QrCodeIcon size={22} weight="bold" /></span><div><h2 className="qr-scan-title">Let someone scan this card</h2><p>{qrMode === "online" ? "They only need their phone camera. No app or account required." : "Works with no internet - this scans straight into their contacts app."}</p></div></div>
            <ol className="scan-steps">
              <li><span>1</span>Open the camera</li>
              <li><span>2</span>Point at the QR</li>
              <li><span>3</span>{qrMode === "online" ? "Open your card" : "Save to contacts"}</li>
            </ol>
            <div className="flow-heading-actions qr-mode-pill">
              <Button size="small" variant={qrMode === "online" ? "primary" : "secondary"} onClick={() => setQrMode("online")}>Online</Button>
              <Button size="small" variant={qrMode === "offline" ? "primary" : "secondary"} onClick={() => setQrMode("offline")}>Offline</Button>
            </div>
            {qr ? (
              <div className="inline-qr-frame">
                <img
                  className="inline-qr-image"
                  src={qr}
                  alt={`QR code for ${profile.name}'s card`}
                  onError={handleQrImageError}
                />
              </div>
            ) : !qrError && (
              <div className="inline-qr-frame" aria-label="Generating QR code" aria-busy="true">
                <span className="skeleton qr-skeleton" />
              </div>
            )}
            <div className="inline-qr-url">
              <span>Public card link</span>
              <strong title={shareUrl}>{shareUrl}</strong>
              <button
                type="button"
                className="review-textfield-copy inline-qr-copy"
                onClick={copyLink}
                aria-label="Copy card link"
              >
                {copied ? <CheckCircleIcon size={14} /> : <CopyIcon size={14} />}
              </button>
            </div>
            <div className="inline-qr-actions">
              {qr && <LinkButton size="small" variant="secondary" href={qr} download={qr.startsWith("data:image/svg+xml") ? "ehllo-qr.svg" : "ehllo-qr.png"}><DownloadSimpleIcon size={16} />Download QR</LinkButton>}
              <Button size="small" variant="ghost" disabled={!qrSvg} onClick={copySvg}><CopyIcon size={16} />{svgCopied ? "SVG copied" : qrSvg ? "Copy QR as SVG" : "Generating QR…"}</Button>
            </div>
            </section> : null}
            {shareTool === "signature" ? <section className="signature-panel card-tool-section">
              <div className="inline-qr-head"><span><EnvelopeSimpleIcon size={22} /></span><div><h2 className="signature-title">Email signature</h2><p>Square photo, name, title, and contact details. Ready for Gmail or Outlook.</p></div></div>
              <div className="signature-preview-card">
                <div className="signature-preview-photo"><span>{initials}</span><CardImage src={photo} alt="" /></div>
                <div className="signature-preview-copy">
                  <strong>{profile.name}</strong>
                  {profile.role ? <span>{profile.role}</span> : null}
                  {profile.company ? <span>{profile.company}</span> : null}
                  {profile.methods.find((method) => method.type === "phone")?.value ? (
                    <small><PhoneIcon size={12} aria-hidden="true" /> {profile.methods.find((method) => method.type === "phone")?.value}</small>
                  ) : null}
                  {profile.methods.find((method) => method.type === "email")?.value || profile.email ? (
                    <small><EnvelopeSimpleIcon size={12} aria-hidden="true" /> {profile.methods.find((method) => method.type === "email")?.value || profile.email}</small>
                  ) : null}
                  <em>View my card</em>
                </div>
              </div>
              <div className="signature-actions">
                <Button size="small" variant="secondary" onClick={() => void copySignature("plain")}><CopyIcon size={14} />{signatureCopied === "plain" ? "Plain copied" : "Copy plain text"}</Button>
                <Button size="small" variant="secondary" onClick={() => void copySignature("html")}><CopyIcon size={14} />{signatureCopied === "html" ? "HTML copied" : "Copy HTML"}</Button>
              </div>
              <small className="signature-note">Use plain text for most clients. HTML keeps phone, email, and card link clickable.</small>
            </section> : null}
            {shareTool === "background" ? <section className="share-surface-panel card-tool-section">
              <div className="inline-qr-head"><span><MonitorIcon size={22} /></span><div><h2 className="virtual-background-title">Virtual background</h2><p>Your name and QR on a meeting-ready background. Use the mirrored version for your self-view.</p></div></div>
              <div className="share-surface-preview virtual-background-preview" style={{ background: cardTheme.backgroundGradient }}>
                <div className="share-surface-overlay">
                  <strong>{profile.name}</strong>
                  <span>{profile.role}{profile.company ? ` · ${profile.company}` : ""}</span>
                  <div className="share-surface-qr">
                    {qr ? <img src={qr} alt="" onError={handleQrImageError} /> : <QrCodeIcon size={18} weight="bold" aria-hidden="true" />}
                  </div>
                </div>
              </div>
              <div className="inline-qr-actions">
                <Button size="small" variant="secondary" onClick={() => void downloadShareAsset("virtual-background", true)}><DownloadSimpleIcon size={16} />Download background</Button>
              </div>
            </section> : null}
            {shareTool === "watch" ? <section className="share-surface-panel card-tool-section">
              <div className="inline-qr-head"><span><WatchIcon size={22} /></span><div><h2 className="watch-title">Smart watch</h2><p>High-contrast QR for Apple Watch or Wear OS watch faces.</p></div></div>
              <div className="share-surface-preview watch-preview">
                <span>Personal card</span>
                <div className="watch-qr">
                  {qr ? <img src={qr} alt={`QR code for ${profile.name}'s card`} onError={handleQrImageError} /> : <QrCodeIcon size={30} weight="bold" aria-hidden="true" />}
                </div>
              </div>
              <div className="inline-qr-actions">
                <Button size="small" variant="secondary" onClick={() => void downloadShareAsset("watch-face")}><DownloadSimpleIcon size={16} />Download watch QR</Button>
              </div>
            </section> : null}
            {shareTool === "widgets" ? <section className="phone-widget-panel card-tool-section">
              <div className="inline-qr-head"><span><DeviceMobileIcon size={22} /></span><div><h2 className="qr-scan-title">Home-screen widgets</h2><p>Choose QR Scan, Business Card, or Recent Connections when adding a widget.</p></div></div>
              <div className="widget-gallery">
                <article className="widget-gallery-card">
                  <header><span>ehllo</span><strong>2 × 2</strong></header>
                  <div className="widget-gallery-preview widget-gallery-qr widget-gallery-card-text-gap">
                    <div className="widget-gallery-qr-frame">
                      {qr ? <img src={qr} alt={`QR code for ${profile.name}'s card`} onError={handleQrImageError} /> : <QrCodeIcon size={24} weight="bold" aria-hidden="true" />}
                    </div>
                  </div>
                  <h4>QR Scan</h4>
                  <p>Large scannable QR for quick sharing.</p>
                </article>
                <article className="widget-gallery-card">
                  <header><span>ehllo</span><strong>4 × 2</strong></header>
                  <div className="widget-gallery-preview widget-gallery-card-layout widget-gallery-card-text-gap">
                    <div className="widget-gallery-card-qr">
                      {qr ? <img src={qr} alt="" onError={handleQrImageError} /> : <QrCodeIcon size={22} weight="bold" aria-hidden="true" />}
                    </div>
                    <div>
                      <div className="widget-layout-avatar">
                        <span>{initials}</span><CardImage src={profile.photo} alt="" />
                      </div>
                      <strong>{profile.name}</strong>
                      {profile.role ? <span>{profile.role}</span> : null}
                      {profile.company ? <small>{profile.company}</small> : null}
                    </div>
                  </div>
                  <h4>Business Card</h4>
                  <p>QR plus your name, role, and company.</p>
                </article>
                <article className="widget-gallery-card">
                  <header><span>ehllo</span><strong>4 × 2</strong></header>
                  <div className="widget-gallery-preview widget-gallery-connections widget-gallery-card-text-gap">
                    <small>RECENT CONNECTIONS</small>
                    <div className="widget-gallery-connection-row">
                      <div className="widget-layout-avatar">
                        <span>{recentConnection ? cardInitials(recentConnection.name) : "C"}</span><CardImage src={recentConnection?.photoUrl} alt="" />
                      </div>
                      <div>
                        <strong>{recentConnection?.name || "Recent connection"}</strong>
                        <span>{recentConnection?.subtitle || "Shared via your card"}</span>
                      </div>
                      <span className="widget-gallery-action"><PhoneIcon size={11} aria-hidden="true" /></span>
                      <span className="widget-gallery-action"><EnvelopeSimpleIcon size={11} aria-hidden="true" /></span>
                    </div>
                  </div>
                  <h4>Recent Connections</h4>
                  <p>Call or message people who shared their details back.</p>
                </article>
              </div>
              <div className="phone-widget-actions">
                {/* Widgets cannot exist on the web, so the useful action here is getting the
                    app. The instructions below used to open with "install and open ehllo
                    once" and offer no way to do it. */}
                <Button size="small" onClick={() => setWidgetsOnPhoneOpen(true)}><DeviceMobileIcon size={15} /> Get the app</Button>
                <Button size="small" variant="secondary" onClick={openInApp}>Open in app</Button>
                <Button size="small" variant="secondary" aria-expanded={showWidgetHelp} onClick={() => setShowWidgetHelp((current) => !current)}>
                  Add a widget {showWidgetHelp ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
                </Button>
              </div>
              {showWidgetHelp && <div className="widget-instructions">
                <article><strong>iPhone or iPad</strong><p>Install and open ehllo once. Touch and hold the Home Screen, tap <b>Edit</b>, then <b>Add Widget</b>. Search for ehllo and pick QR Scan, Business Card, or Recent Connections.</p></article>
                <article><strong>Android</strong><p>Install and open ehllo once. Touch and hold an empty part of the Home Screen, tap <b>Widgets</b>, then choose one of the three ehllo widgets.</p></article>
                <small>Refresh widgets from Card Tools in the app after publishing changes or receiving new connections.</small>
              </div>}
            </section> : null}
            {shareTool === "wallet" ? <section className="card-tool-section card-tool-qr-section wallet-tool-section"><WalletSharePanel slug={profile.slug} shareUrl={shareUrl} /></section> : null}
            </div>
          </section>
          </div>
            </div>
            <ShareCardModal
              open={shareModalOpen}
              onClose={() => setShareModalOpen(false)}
              cardName={profile.name}
              shareUrl={shareUrl}
              qrDataUrl={qr}
              copied={copied}
              onCopyLink={copyLink}
            />
            {cardActionsOpen ? (
              <div className="connections-modal-backdrop card-actions-sheet-backdrop" role="presentation" onClick={() => setCardActionsOpen(false)}>
                <section className="connections-modal card-actions-sheet" role="dialog" aria-modal="true" aria-labelledby="card-actions-title" onClick={(event) => event.stopPropagation()}>
                  <header>
                    <h2 id="card-actions-title">Card actions</h2>
                    <button type="button" aria-label="Close card actions" onClick={() => setCardActionsOpen(false)}><XIcon size={18} /></button>
                  </header>
                  <div className="card-actions-sheet-list">
                    <LinkButton variant="ghost" href={`/app/card/edit?id=${activeId}`} onClick={() => setCardActionsOpen(false)}><PencilSimpleIcon size={17} /> Edit card</LinkButton>
                    <Button variant="ghost" onClick={() => { setCardActionsOpen(false); setShareModalOpen(true); }}><UploadSimpleIcon size={17} /> Share card</Button>
                    <Button variant="ghost" loading={deletingCard} onClick={() => { setCardActionsOpen(false); void deleteActiveCard(); }}><TrashIcon size={17} /> {deletingCard ? "Deleting…" : "Delete card"}</Button>
                  </div>
                </section>
              </div>
            ) : null}
            <WidgetsOnPhoneModal
              open={widgetsOnPhoneOpen}
              onClose={() => setWidgetsOnPhoneOpen(false)}
              // Real card data, so the preview is this person's widget rather than a mock-up.
              preview={{
                qrDataUrl: qr,
                name: profile.name,
                role: profile.role,
                company: profile.company,
                photoUrl: profile.photo,
              }}
            />
          </>
        )}
      </div>
    </>
  );
}
