"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { Copy as CopyIcon } from "react-feather";
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
import { PageSkeleton, StatusMessage } from "../../components/AsyncState";
import { Button, LinkButton } from "../../components/Button";
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
import { themeCoverBadgeStyle, themeForegroundColor, themeSurfaceStyle } from "../../../lib/theme-contrast";
import { hydrateCardLibraryFromServer, queueCardSync } from "../../../lib/card-library-sync";
import { applyCardTemplate } from "../../../lib/card-templates";
import type { CardTemplate } from "../../../lib/workspace/types";
import "../../app/product.css";
import "../../app/flow.css";

type Method = { id: string; type: string; value: string; label: string };
type Profile = LibraryCard & { email: string; website: string };
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
  const cardTheme = useMemo(() => themeSurfaceStyle(profile.theme), [profile.theme]);

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
      setQrError("We couldn’t load your saved cards. Refresh the page to try again.");
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
    }).catch(() => setQrError("We couldn’t generate this QR code. Check the card link and try again."));
  }, [profile.slug, shareUrl]);

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
    if (cards.length >= MAX_CARDS) return;
    const card = createLibraryCard({
      label: `Card ${cards.length + 1}`,
      theme: ["#9fe870", "#2495e8", "#ff9f43", "#a83df0", "#14b8a6"][cards.length],
      ...seed,
    });
    upsertLibraryCard(localStorage, card);
    queueCardSync(card);
    window.location.assign(`/business/card/edit?id=${card.id}`);
  }

  function createCardFromTemplate(template: CardTemplate) {
    if (cards.length >= MAX_CARDS) return;
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

  async function downloadShareAsset(type: "virtual-background" | "watch-face") {
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
    const extension = type === "virtual-background" ? "jpg" : "png";
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `ehllo-${type}-${profile.slug}.${extension}`;
    link.click();
    URL.revokeObjectURL(href);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function copySvg() {
    await navigator.clipboard.writeText(qrSvg);
    setSvgCopied(true);
    window.setTimeout(() => setSvgCopied(false), 1400);
  }

  async function copySignature(format: "plain" | "html") {
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

  return (
    <BusinessShell
      active="cards"
      title="My cards"
      subtitle={`${cards.length} of ${MAX_CARDS} cards created`}
    >
      <div className="flow-page">
        {qrError && <StatusMessage tone="error">{qrError}</StatusMessage>}
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
                        {card.coverPhoto ? (
                          <img src={card.coverPhoto} alt="" className="card-overview-cover-photo" />
                        ) : (
                          <div className="card-overview-cover-fallback" style={{ background: themeSurfaceStyle(card.theme).backgroundGradient }} />
                        )}
                        <div className="card-overview-avatar">
                          {card.photo ? (
                            <img src={card.photo} alt="" className="card-overview-avatar-photo" />
                          ) : (
                            <span className="card-overview-avatar-fallback">{cardInitials(card.name)}</span>
                          )}
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
              <div className="share-avatar">{photo ? <img src={photo} alt="" /> : initials}</div>
              <h2>{profile.name}</h2>
              <p className="share-role">{profile.role}{profile.company ? ` · ${profile.company}` : ""}</p>
              <p>{profile.bio}</p>
              <div className="share-contact">
                {actionMethods.map((method) => {
                  const href = contactMethodHref(method);
                  return href
                    ? <a key={method.id} href={href} target={contactMethodOpensNewTab(href) ? "_blank" : undefined} rel={contactMethodOpensNewTab(href) ? "noreferrer" : undefined}>
                        <span><strong>{method.label}</strong><small>{method.value}</small></span><ArrowSquareOutIcon />
                      </a>
                    : <span className="unavailable-method" key={method.id}><strong>{method.label}</strong><small>{method.value}</small></span>;
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
            <div className="inline-qr-url"><span>Public card link</span><strong>{shareUrl}</strong></div>
            <div className="inline-qr-actions">
              <Button onClick={copyLink}><CopyIcon size={18} />{copied ? "Link copied" : "Copy link"}</Button>
              {qr && <LinkButton variant="secondary" href={qr} download={qr.startsWith("data:image/svg+xml") ? "ehllo-qr.svg" : "ehllo-qr.png"}><DownloadSimpleIcon size={18} />Download QR</LinkButton>}
            </div>
            <Button fullWidth size="small" variant="ghost" disabled={!qrSvg} onClick={copySvg}><CopyIcon size={16} />{svgCopied ? "SVG copied" : qrSvg ? "Copy QR as SVG" : "Generating QR…"}</Button>
            <section className="signature-panel">
              <div className="inline-qr-head"><span><EnvelopeSimpleIcon size={22} /></span><div><h2>Email signature</h2><p>Square photo, name, title, and contact details. Ready for Gmail or Outlook.</p></div></div>
              <div className="signature-preview-card">
                <div className="signature-preview-photo">{photo ? <img src={photo} alt="" /> : initials}</div>
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
              <div className="inline-qr-actions">
                <Button variant="secondary" onClick={() => void copySignature("plain")}><CopyIcon size={18} />{signatureCopied === "plain" ? "Plain copied" : "Copy plain text"}</Button>
                <Button variant="secondary" onClick={() => void copySignature("html")}><CopyIcon size={18} />{signatureCopied === "html" ? "HTML copied" : "Copy HTML"}</Button>
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
              <Button variant="secondary" onClick={() => void downloadShareAsset("virtual-background")}><DownloadSimpleIcon size={18} />Download background</Button>
            </section>
            <section className="share-surface-panel">
              <div className="inline-qr-head"><span><WatchIcon size={22} /></span><div><h2>Smart watch</h2><p>High-contrast QR for Apple Watch or Wear OS watch faces.</p></div></div>
              <div className="share-surface-preview watch-preview">
                <span>Personal card</span>
                <div className="watch-qr">
                  {qr ? <img src={qr} alt={`QR code for ${profile.name}'s card`} /> : <QrCodeIcon size={30} weight="bold" aria-hidden="true" />}
                </div>
              </div>
              <Button variant="secondary" onClick={() => void downloadShareAsset("watch-face")}><DownloadSimpleIcon size={18} />Download watch QR</Button>
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
                  <div className="widget-gallery-preview widget-gallery-card-layout">
                    <div className="widget-gallery-card-qr">
                      {qr ? <img src={qr} alt="" /> : <QrCodeIcon size={22} weight="bold" aria-hidden="true" />}
                    </div>
                    <div>
                      <div className="widget-layout-avatar">{initials}</div>
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
                  <div className="widget-gallery-preview widget-gallery-connections">
                    <small>RECENT CONNECTIONS</small>
                    <div className="widget-gallery-connection-row">
                      <div className="widget-layout-avatar">C</div>
                      <div><strong>Recent connection</strong><span>Shared via your card</span></div>
                      <span className="widget-gallery-action">☎</span>
                      <span className="widget-gallery-action">✉</span>
                    </div>
                  </div>
                  <h4>Recent Connections</h4>
                  <p>Call or message people who shared their details back.</p>
                </article>
              </div>
              <div className="phone-widget-actions">
                <Button onClick={openInApp}><DeviceMobileIcon size={17} /> Open in app</Button>
                <Button variant="secondary" aria-expanded={showWidgetHelp} onClick={() => setShowWidgetHelp((current) => !current)}>Add a widget {showWidgetHelp ? <CaretUpIcon /> : <CaretDownIcon />}</Button>
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
