"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { Copy as CopyIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { Download as DownloadSimpleIcon } from "react-feather";
import { Monitor as MonitorIcon } from "react-feather";
import { Watch as WatchIcon } from "react-feather";
import { Mail as EnvelopeSimpleIcon } from "react-feather";
import { Edit2 as PencilSimpleIcon } from "react-feather";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { ExternalLink as ArrowSquareOutIcon } from "react-feather";
import { Plus as PlusIcon } from "react-feather";
import { Trash2 as TrashIcon } from "react-feather";
import { Smartphone as DeviceMobileIcon } from "react-feather";
import { ChevronDown as CaretDownIcon } from "react-feather";
import { ChevronUp as CaretUpIcon } from "react-feather";
import { ShareCardModal } from "../../components/ShareCardModal";
import { Upload as UploadSimpleIcon } from "react-feather";
import { BusinessShell } from "../../components/BusinessShell";
import { useAppUser } from "../../components/AppUserContext";
import { PageSkeleton } from "../../components/AsyncState";
import { CardImage } from "../../components/CardImage";
import { Button, LinkButton } from "../../components/Button";
import { ContactMethodIcon } from "../../components/ContactMethodIcon";
import { useToast } from "../../components/ToastContext";
import { contactMethodHref, contactMethodOpensNewTab } from "../../../lib/contact-methods";
import { buildHtmlSignature, buildPlainSignature } from "../../../lib/email-signature";
import { WalletSharePanel } from "../../components/WalletSharePanel";
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
import { hydrateCardLibraryFromServer, queueCardSync } from "../../../lib/card-library-sync";
import { applyCardTemplate } from "../../../lib/card-templates";
import type { CardTemplate } from "../../../lib/workspace/types";
import {
  enrichConnectionPhotos,
  fetchAllConnectionsMerged,
  sortConnections,
  type ConnectionItem,
} from "../../../lib/connections";
import "../../app/product.css";
import "../../app/flow.css";

type Method = { id: string; type: string; value: string; label: string };
type Profile = LibraryCard & { email: string; website: string };
type QrShareType = "virtual-background" | "watch-face";

function parseDownloadFilename(contentDisposition: string | null) {
  if (!contentDisposition) return null;

  const utf8Match = /filename\\*=(?:UTF-8''|utf-8'')([^;]+)/i.exec(contentDisposition);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1].trim().replace(/\"/g, ""));
  }

  const quotedMatch = /filename="([^"]+)"/i.exec(contentDisposition);
  if (quotedMatch?.[1]) return quotedMatch[1];

  const unquotedMatch = /filename=([^;\\s]+)/i.exec(contentDisposition);
  return unquotedMatch?.[1] ?? null;
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
  const user = useAppUser();
  const [profile, setProfile] = useState(fallback);
  const [cards, setCards] = useState<LibraryCard[]>([]);
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [isTeamWorkspace, setIsTeamWorkspace] = useState(false);
  const [activeId, setActiveId] = useState(fallback.id);
  const [photo, setPhoto] = useState("");
  const [qr, setQr] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [copied, setCopied] = useState(false);
  const [svgCopied, setSvgCopied] = useState(false);
  const [signatureCopied, setSignatureCopied] = useState<"" | "plain" | "html">("");
  const [showWidgetHelp, setShowWidgetHelp] = useState(false);
  const [viewingCard, setViewingCard] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [qrError, setQrError] = useState("");
  const [shareUrl, setShareUrl] = useState("http://localhost:3000/c/alex-morgan");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [recentConnection, setRecentConnection] = useState<ConnectionItem | null>(null);
  const cardTheme = useMemo(() => themeSurfaceStyle(profile.theme), [profile.theme]);
  const { showToast } = useToast();

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
    function refreshFromStorage() {
      if (document.visibilityState === "hidden") return;
      try {
        applyLibrary(readCardLibrary(localStorage));
      } catch {
        // Ignore malformed local storage while editing elsewhere.
      }
    }

    window.addEventListener("focus", refreshFromStorage);
    document.addEventListener("visibilitychange", refreshFromStorage);
    return () => {
      window.removeEventListener("focus", refreshFromStorage);
      document.removeEventListener("visibilitychange", refreshFromStorage);
    };
  }, [activeId]);

  useEffect(() => {
    if (!profile.slug) {
      return;
    }

    const options = {
      width: 900,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#163300", light: "#ffffff" },
    } as const;
    Promise.all([
      fetch(`/api/cards/share-assets/${encodeURIComponent(profile.slug)}?type=branded-qr&size=900`)
        .then(async (response) => {
          if (!response.ok) return null;
          const payload = await response.json() as { dataUri?: string };
          return payload.dataUri || null;
        })
        .catch(() => null),
      QRCode.toString(shareUrl, { ...options, type: "svg" }),
    ]).then(([image, svg]) => {
      const svgDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      setQrError("");
      setQr(image || svgDataUri);
      setQrSvg(svg);
    }).catch(() => {
      const message = "We couldn’t generate this QR code. Check the card link and try again.";
      setQrError(message);
      showQrError(message);
    });
  }, [profile.slug, shareUrl]);

  function showQrError(message: string, action?: { label: string; onClick: () => void }) {
    showToast({
      tone: "error",
      message,
      action,
      durationMs: 6000,
    });
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
    window.history.pushState(null, "", `/business/cards?id=${card.id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showCardLibrary() {
    setViewingCard(false);
    setShowWidgetHelp(false);
    window.history.pushState(null, "", "/business/cards");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function createCard(seed: Partial<LibraryCard> = {}) {
    // Re-read storage rather than trusting this component's `cards` state,
    // which can be stale relative to another tab or a recent sync.
    if (readCardLibrary(localStorage).length >= MAX_CARDS) {
      showToast({ tone: "error", message: "You’ve reached the card limit. Delete a card first, then create a new one." });
      return;
    }
    const card = createLibraryCard({
      label: `Card ${cards.length + 1}`,
      theme: ["#9fe870", "#2495e8", "#ff9f43", "#a83df0", "#14b8a6"][cards.length],
      ...seed,
    });
    if (Object.keys(seed).length > 0) {
      upsertLibraryCard(localStorage, card);
      queueCardSync(card);
      window.location.assign(`/business/card/edit?id=${card.id}`);
      return;
    }
    window.location.assign(`/business/card/edit?mode=create&new=1`);
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
    window.location.assign(`/business/card/edit?id=${card.id}`);
  }

  function deleteActiveCard() {
    if (!window.confirm(`Delete “${profile.label}”? This cannot be undone.`)) return;
    const next = removeLibraryCard(localStorage, activeId);
    setCards(next);
    setViewingCard(false);
    window.history.replaceState(null, "", "/business/cards");
    if (next[0]) selectCard(next[0]);
  }

  async function downloadShareAsset(type: QrShareType) {
    try {
      const response = await fetch(`/api/cards/share-assets/${encodeURIComponent(profile.slug)}?type=${type}`);
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
      const contentDisposition = response.headers.get("content-disposition");
      link.href = href;
      link.download = parseDownloadFilename(contentDisposition) || `ehllo-${type}-${profile.slug}` + (type === "virtual-background" ? ".jpg" : ".png");
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(href);
      }, 1500);
      showToast({
        tone: "success",
        message: `${type === "virtual-background" ? "Background" : "Watch QR"} downloaded.`,
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
      window.setTimeout(() => setCopied(false), 1400);
    } catch {}
  }

  async function copySvg() {
    try {
      await navigator.clipboard.writeText(qrSvg);
      setSvgCopied(true);
      window.setTimeout(() => setSvgCopied(false), 1400);
    } catch {}
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
      window.setTimeout(() => setSignatureCopied(""), 1400);
    } catch {}
  }

  function openInApp() {
    window.location.href = `ehllo://share-card?slug=${encodeURIComponent(profile.slug)}`;
  }

  const initials = profile.name.split(" ").map((word) => word[0]).join("").slice(0, 2);
  const actionMethods = profile.methods.length
    ? profile.methods
    : [
        { id: "legacy-email", type: "email", value: profile.email, label: "Email" },
        { id: "legacy-website", type: "website", value: profile.website, label: "Website" },
      ].filter((method) => method.value);

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

  useEffect(() => {
    // loadRecentConnection resolves its own loading state on the signed-out path,
    // which has to land in this commit so the panel does not flash a spinner it
    // is never going to finish.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecentConnection();
  }, [loadRecentConnection]);

  return (
    <BusinessShell
      active="cards"
      title="My cards"
      subtitle={`${cards.length} of ${MAX_CARDS} cards created`}
    >
      <div className="flow-page">
        {!hydrated ? <PageSkeleton rows={3} /> : !cards.length ? (
          <section className="cards-empty-state">
            <div className="cards-empty-visual"><div><QrCodeIcon size={42} weight="bold" /></div><span><PlusIcon size={22} /></span></div>
            <span className="step-pill">Your first card</span>
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
              <Button size="small" variant="ghost" onClick={showCardLibrary}><ArrowLeftIcon size={16} /> All cards</Button>
              <div><span>Viewing</span><strong>{profile.label}</strong></div>
              <div><LinkButton size="small" variant="secondary" href={`/business/card/edit?id=${activeId}`}><PencilSimpleIcon size={16} /> Edit card</LinkButton><Button size="small" variant="secondary" onClick={() => setShareModalOpen(true)}><UploadSimpleIcon size={16} /> Share card</Button><Button size="small" variant="ghost" onClick={deleteActiveCard}><TrashIcon size={16} /> Delete</Button></div>
            </div>
            <div className="card-share-layout" id="share">
          <article className="share-card-preview">
            <div className="share-card-cover" style={{ background: cardTheme.backgroundGradient, color: cardTheme.color }}>
              <span style={themeCoverBadgeStyle(profile.theme)}>{profile.company[0] || "A"}</span>
              <strong style={{ color: cardTheme.color }}>{profile.company || "Your company"}</strong>
            </div>
            <div className="share-card-body">
              <div className="share-avatar"><span>{initials}</span><CardImage src={photo} alt={profile.name || "Profile picture"} /></div>
              <h2>{profile.name}</h2>
              <p className="share-role">{profile.role}{profile.company ? ` · ${profile.company}` : ""}</p>
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
              <LinkButton fullWidth variant="secondary" href={`/business/card/edit?id=${activeId}`}><PencilSimpleIcon size={17} />Edit card</LinkButton>
            </div>
          </article>
          <section className="inline-qr-panel">
            <div className="inline-qr-head"><span><QrCodeIcon size={22} weight="bold" /></span><div><h2>Let someone scan this card</h2><p>They only need their phone camera. No app or account required.</p></div></div>
            <ol className="scan-steps">
              <li><span>1</span>Open the camera</li>
              <li><span>2</span>Point at the QR</li>
              <li><span>3</span>Open your card</li>
            </ol>
            {qr ? (
              <div className="inline-qr-frame">
                <img className="inline-qr-image" src={qr} alt={`QR code for ${profile.name}'s card`} />
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
            <section className="signature-panel">
              <div className="inline-qr-head"><span><EnvelopeSimpleIcon size={22} /></span><div><h2>Email signature</h2><p>Square photo, name, title, and contact details. Ready for Gmail or Outlook.</p></div></div>
              <div className="signature-preview-card">
                <div className="signature-preview-photo"><span>{initials}</span><CardImage src={photo} alt="" /></div>
                <div className="signature-preview-copy">
                  <strong>{profile.name}</strong>
                  {profile.role ? <span>{profile.role}</span> : null}
                  {profile.company ? <span>{profile.company}</span> : null}
                  {profile.methods.find((method) => method.type === "phone")?.value ? (
                    <small>☎ {profile.methods.find((method) => method.type === "phone")?.value}</small>
                  ) : null}
                  {profile.methods.find((method) => method.type === "email")?.value || profile.email ? (
                    <small>✉ {profile.methods.find((method) => method.type === "email")?.value || profile.email}</small>
                  ) : null}
                  <em>View my card</em>
                </div>
              </div>
              <div className="signature-actions">
                <Button size="small" variant="secondary" onClick={() => void copySignature("plain")}><CopyIcon size={14} />{signatureCopied === "plain" ? "Plain copied" : "Copy plain text"}</Button>
                <Button size="small" variant="secondary" onClick={() => void copySignature("html")}><CopyIcon size={14} />{signatureCopied === "html" ? "HTML copied" : "Copy HTML"}</Button>
              </div>
              <small className="signature-note">Use plain text for most clients. HTML keeps phone, email, and card link clickable.</small>
            </section>
            <section className="share-surface-panel">
              <div className="inline-qr-head"><span><MonitorIcon size={22} /></span><div><h2>Virtual background</h2><p>Meeting background with your name and a scannable QR in the corner.</p></div></div>
              <div className="share-surface-preview virtual-background-preview" style={{ background: cardTheme.backgroundGradient }}>
                <div className="share-surface-overlay">
                  <strong>{profile.name}</strong>
                  <span>{profile.role}{profile.company ? ` · ${profile.company}` : ""}</span>
                  <div className="share-surface-qr">
                    {qr ? <img src={qr} alt="" /> : <QrCodeIcon size={18} weight="bold" aria-hidden="true" />}
                  </div>
                </div>
              </div>
              <Button size="small" variant="secondary" onClick={() => void downloadShareAsset("virtual-background")}><DownloadSimpleIcon size={16} />Download background</Button>
            </section>
            <section className="share-surface-panel">
              <div className="inline-qr-head"><span><WatchIcon size={22} /></span><div><h2>Smart watch</h2><p>High-contrast QR for Apple Watch or Wear OS watch faces.</p></div></div>
              <div className="share-surface-preview watch-preview">
                <span>Personal card</span>
                <div className="watch-qr">
                  {qr ? <img src={qr} alt={`QR code for ${profile.name}'s card`} /> : <QrCodeIcon size={30} weight="bold" aria-hidden="true" />}
                </div>
              </div>
              <Button size="small" variant="secondary" onClick={() => void downloadShareAsset("watch-face")}><DownloadSimpleIcon size={16} />Download watch QR</Button>
            </section>
            <section className="phone-widget-panel">
              <div className="phone-widget-head"><span><DeviceMobileIcon size={22} /></span><div><h3>Home-screen widgets</h3><p>Choose QR Scan, Business Card, or Recent Connections when adding a widget.</p></div></div>
              <div className="widget-gallery">
                <article className="widget-gallery-card">
                  <header><span>ehllo</span><strong>2 × 2</strong></header>
                  <div className="widget-gallery-preview widget-gallery-qr">
                    <div className="widget-gallery-qr-frame">
                      {qr ? <img src={qr} alt={`QR code for ${profile.name}'s card`} /> : <QrCodeIcon size={24} weight="bold" aria-hidden="true" />}
                    </div>
                  </div>
                  <h4>QR Scan</h4>
                  <p>Large scannable QR for quick sharing.</p>
                </article>
                <article className="widget-gallery-card">
                  <header><span>ehllo</span><strong>4 × 2</strong></header>
                  <div className="widget-gallery-preview widget-gallery-card-layout widget-gallery-card-text-gap">
                    <div className="widget-gallery-card-qr">
                      {qr ? <img src={qr} alt="" /> : <QrCodeIcon size={22} weight="bold" aria-hidden="true" />}
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
                      <span className="widget-gallery-action">☎</span>
                      <span className="widget-gallery-action">✉</span>
                    </div>
                  </div>
                  <h4>Recent Connections</h4>
                  <p>Call or message people who shared their details back.</p>
                </article>
              </div>
              <div className="phone-widget-actions">
                <Button size="small" onClick={openInApp}><DeviceMobileIcon size={15} /> Open in app</Button>
                <Button size="small" variant="secondary" aria-expanded={showWidgetHelp} onClick={() => setShowWidgetHelp((current) => !current)}>
                  Add a widget {showWidgetHelp ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
                </Button>
              </div>
              {showWidgetHelp && <div className="widget-instructions">
                <article><strong>iPhone or iPad</strong><p>Install and open ehllo once. Touch and hold the Home Screen, tap <b>Edit</b>, then <b>Add Widget</b>. Search for ehllo and pick QR Scan, Business Card, or Recent Connections.</p></article>
                <article><strong>Android</strong><p>Install and open ehllo once. Touch and hold an empty part of the Home Screen, tap <b>Widgets</b>, then choose one of the three ehllo widgets.</p></article>
                <small>Refresh widgets from Card Tools in the app after publishing changes or receiving new connections.</small>
              </div>}
            </section>
            <WalletSharePanel slug={profile.slug} shareUrl={shareUrl} />
          </section>
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
          </>
        )}
      </div>
    </BusinessShell>
  );
}
