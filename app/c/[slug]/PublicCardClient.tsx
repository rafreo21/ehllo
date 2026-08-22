"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ArrowRight as ArrowRightIcon } from "react-feather";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { ArrowUpRight as ArrowUpRightIcon } from "react-feather";
import { CreditCard as IdentificationCardIcon } from "react-feather";
import { Send as SendIcon } from "react-feather";
import { UserPlus as UserPlusIcon } from "react-feather";
import { Button } from "../../components/Button";
import { BrandMark } from "../../components/BrandMark";
import { CardImage } from "../../components/CardImage";
import { ContactMethodIcon } from "../../components/ContactMethodIcon";
import { PublicAppDownloadPrompt } from "../../components/PublicAppDownloadPrompt";
import { VisitorSignInPrompt } from "../../components/VisitorSignInPrompt";
import { contactMethodHref } from "@/lib/contact-methods";
import { buildFollowUpMailto } from "@/lib/follow-up-email";
import { themeCoverBadgeStyle, themeForegroundColor, themeSurfaceStyle } from "@/lib/theme-contrast";
import { PublicExchangeForm } from "./PublicExchangeForm";

type CardMethod = {
  id: string;
  method_type: string;
  label: string | null;
  value: string;
};

type Step = "save" | "share";

function publicRoleLine(jobTitle: string | null, company: string | null, showCompanyDetails: boolean) {
  return [jobTitle, showCompanyDetails ? company : null].filter(Boolean).join(" · ");
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function publicMethodHref(method: CardMethod, ownerName: string) {
  if (method.method_type === "email") {
    return buildFollowUpMailto(method.value, ownerName);
  }
  return contactMethodHref({
    type: method.method_type,
    value: method.value,
  });
}

function PublicCardView({
  ownerName,
  jobTitle,
  company,
  companyLogoUrl,
  showCompanyDetails,
  bio,
  coverImageUrl,
  profileImageUrl,
  themeColor,
  methods,
  onSaveContact,
  slug,
  onShareBack,
}: {
  ownerName: string;
  jobTitle: string | null;
  company: string | null;
  companyLogoUrl: string | null;
  showCompanyDetails: boolean;
  bio: string | null;
  coverImageUrl: string | null;
  profileImageUrl: string | null;
  themeColor: string;
  methods: CardMethod[];
  onSaveContact: () => void;
  slug: string;
  onShareBack: () => void;
}) {
  const theme = themeSurfaceStyle(themeColor);
  const coverBadge = themeCoverBadgeStyle(themeColor);
  const roleLine = publicRoleLine(jobTitle, company, showCompanyDetails);

  return (
    <>
      <div
        className="public-card-cover"
        style={{ background: theme.backgroundGradient }}>
        <CardImage src={coverImageUrl} alt="" className="public-card-cover-photo" />
        {showCompanyDetails && (companyLogoUrl || company) ? (
          <div className="public-card-company-row">
            {companyLogoUrl ? (
              <><span className="public-card-company-mark" style={coverBadge}>{company?.[0] || "A"}</span><CardImage src={companyLogoUrl} alt="" className="public-card-company-logo" /></>
            ) : company ? (
              <span className="public-card-company-mark" style={coverBadge}>{company[0]}</span>
            ) : null}
            {company ? (
              <span className="public-card-company-name" style={{ color: coverImageUrl ? undefined : theme.color }}>
                {company}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="public-card-content">
        <div className="public-card-avatar" style={coverBadge}>
          <span>
            {ownerName
              .split(/\s+/)
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </span>
          <CardImage src={profileImageUrl} alt={ownerName} />
        </div>
        <h1>{ownerName}</h1>
        {roleLine ? <p className="public-card-role">{roleLine}</p> : null}

        <div className="public-card-step">
          {bio ? <p className="public-card-bio">{bio}</p> : null}
          {methods.length ? <div className="public-card-methods">
            {methods.map((method) => {
              const href = publicMethodHref(method, ownerName);
              if (!href) return null;
              const displayValue = href.startsWith("http") ? href : method.value;
              return (
                <a
                  key={method.id}
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  className="public-card-method-link"
                >
                  <span
                    className="public-card-method-icon"
                    style={{ color: theme.backgroundColor }}
                  >
                    <ContactMethodIcon type={method.method_type} color={theme.backgroundColor} size={18} />
                  </span>
                  <span>
                    <strong>{method.label || method.method_type}</strong>
                    <small>{displayValue}</small>
                  </span>
                  <ArrowUpRightIcon className="public-card-method-action" size={17} aria-hidden="true" />
                </a>
              );
            })}
          </div> : null}

          <div className="public-card-actions">
            <button
              type="button"
              className="public-card-return"
              style={{ background: theme.backgroundGradient, color: theme.color }}
              onClick={onSaveContact}
            >
              <UserPlusIcon size={16} /> Save to contacts
            </button>
            <button type="button" className="public-card-share-back" onClick={onShareBack}>
              <SendIcon size={16} /> Share my details back
            </button>
          </div>
          {/*
            For someone who already uses ehllo. Until now a card link opened on a
            desktop offered only "save to contacts" - the phone would add the person to
            your people list and tell you whether you already knew them, and the web
            did neither. Deliberately a plain link rather than a signed-in check: the
            card page is public and mostly viewed by people with no account, and
            looking up a session on every anonymous view costs more than it tells us.
            The app route decides, and sends anyone signed out to sign in first.
          */}
          <a className="public-card-open-in-app" href={`/app/scan?card=${encodeURIComponent(slug)}`}>
            <span>Add {ownerName.split(" ")[0] || "them"} in ehllo</span><ArrowRightIcon size={15} />
          </a>
          <p className="public-card-private">
            Save {ownerName} to your phone now. Share your details back anytime.
          </p>
          <div className="public-card-brand"><BrandMark size={22} /><span>Shared with <strong>ehllo</strong></span></div>
        </div>
      </div>
    </>
  );
}

export function PublicCardClient({
  slug,
  eventTitle,
  ownerName,
  jobTitle,
  company,
  companyLogoUrl,
  showCompanyDetails,
  bio,
  coverImageUrl,
  profileImageUrl,
  themeColor,
  methods,
}: {
  slug: string;
  eventTitle: string;
  ownerName: string;
  jobTitle: string | null;
  company: string | null;
  companyLogoUrl: string | null;
  showCompanyDetails: boolean;
  bio: string | null;
  coverImageUrl: string | null;
  profileImageUrl: string | null;
  themeColor: string;
  methods: CardMethod[];
}) {
  const [step, setStep] = useState<Step>("save");
  const [showCoach, setShowCoach] = useState(false);
  const [showAppDownload, setShowAppDownload] = useState(false);
  const [visitorEmail, setVisitorEmail] = useState("");
  const vcardUrl = `/c/${encodeURIComponent(slug)}/contact.vcf${eventTitle ? `?event=${encodeURIComponent(eventTitle)}` : ""}`;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step, showAppDownload]);

  // Best-effort: lets this card reload from cache if opened again while
  // offline (e.g. weak signal indoors after the initial scan). Scoped to
  // /c/ so it can never intercept anything outside public card pages.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/card-sw.js", { scope: "/c/" }).catch(() => {});
  }, []);

  function openContactFile() {
    if (isIosDevice()) {
      window.location.href = vcardUrl;
      return;
    }
    const link = document.createElement("a");
    link.href = vcardUrl;
    link.download = `${ownerName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "contact"}.vcf`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function goToShareStep() {
    setShowCoach(false);
    setStep("share");
  }

  function returnToCard() {
    setShowAppDownload(false);
    setStep("save");
  }

  function handleSaveClick() {
    if (isIosDevice()) {
      setShowCoach(true);
      return;
    }
    openContactFile();
    goToShareStep();
  }

  function handleCoachContinue() {
    openContactFile();
    goToShareStep();
  }

  function handleExchangeSent(email: string) {
    setVisitorEmail(email);
    setShowAppDownload(true);
  }

  const themeStyle = {
    "--card-accent": themeColor,
    "--card-on-accent": themeForegroundColor(themeColor),
  } as CSSProperties;

  if (showAppDownload) {
    return (
      <main className="public-card-page" style={themeStyle}>
        <PublicAppDownloadPrompt
          ownerName={ownerName}
          visitorEmail={visitorEmail}
          slug={slug}
          onClose={returnToCard}
        />
      </main>
    );
  }

  if (step === "share") {
    return (
      <main className="public-card-page public-card-page--share" style={themeStyle}>
        <section className="public-card-shell public-card-shell-share">
          <div className="public-card-share-page">
            <div className="public-card-share-top">
              <button type="button" className="ghost-link public-card-share-skip" onClick={returnToCard}>
                <ArrowLeftIcon size={16} /> Back to {ownerName.split(" ")[0] || "card"}
              </button>
            </div>
            <div className="public-card-share-heading">
              <h1>Stay in touch</h1>
              <p>Send your contact details to {ownerName}.</p>
            </div>
            <PublicExchangeForm slug={slug} ownerName={ownerName} themeColor={themeColor} onSent={handleExchangeSent} />

            {/* The other way out of this screen, and until now the only way in was through
                the form. showAppDownload - which holds the single link on the web that
                creates a connection - is set by handleExchangeSent and nothing else, so a
                visitor who would rather not hand over their email could look at a card,
                save the vCard, and never be offered a way to keep the person in ehllo.
                Keeping people is the entire product. This component existed for exactly
                that and was rendered nowhere. */}
            <VisitorSignInPrompt slug={slug} ownerName={ownerName} compact />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="public-card-page" style={themeStyle}>
      <section className="public-card-shell">
        <PublicCardView
          ownerName={ownerName}
          jobTitle={jobTitle}
          company={company}
          companyLogoUrl={companyLogoUrl}
          showCompanyDetails={showCompanyDetails}
          bio={bio}
          coverImageUrl={coverImageUrl}
          profileImageUrl={profileImageUrl}
          themeColor={themeColor}
          methods={methods}
          onSaveContact={handleSaveClick}
          slug={slug}
          onShareBack={goToShareStep}
        />
      </section>

      {showCoach ? (
        <div className="public-save-coach" role="dialog" aria-modal="true" aria-labelledby="save-coach-title">
          <div className="public-save-coach-card">
            <IdentificationCardIcon size={34} />
            <h2 id="save-coach-title">Save {ownerName} to your phone</h2>
            <p>
              On the next screen, scroll down and tap <strong>Create New Contact</strong> so iOS saves the right name,
              email, and links.
            </p>
            <div className="public-save-coach-preview">
              <span>Create New Contact</span>
              <small>Add to Existing Contact</small>
            </div>
            <Button fullWidth onClick={handleCoachContinue}>
              Continue <ArrowRightIcon size={18} />
            </Button>
            <button type="button" className="ghost-link" onClick={() => setShowCoach(false)}>
              Back
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
