"use client";

import { useEffect } from "react";
import { CopyIcon } from "@phosphor-icons/react/dist/csr/Copy";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react/dist/csr/EnvelopeSimple";
import { LinkedinLogoIcon } from "@phosphor-icons/react/dist/csr/LinkedinLogo";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import {
  buildEmailShareUrl,
  buildLinkedInShareUrl,
  buildSmsShareUrl,
} from "../../lib/card-share-links";
import { Button, IconButton, LinkButton } from "./Button";

type ShareCardModalProps = {
  open: boolean;
  onClose: () => void;
  cardName: string;
  shareUrl: string;
  qrDataUrl: string;
  copied: boolean;
  onCopyLink: () => void;
};

export function ShareCardModal({
  open,
  onClose,
  cardName,
  shareUrl,
  qrDataUrl,
  copied,
  onCopyLink,
}: ShareCardModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="method-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="share-card-modal method-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-card-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span><QrCodeIcon size={20} weight="bold" /></span>
            <h2 id="share-card-title">Share card</h2>
          </div>
          <IconButton aria-label="Close share card" onClick={onClose}><XIcon weight="bold" /></IconButton>
        </header>

        <div className="share-card-modal-body">
          <label className="share-card-link-field">
            <span>Public card link</span>
            <div>
              <input readOnly value={shareUrl} />
              <Button size="small" variant="secondary" onClick={() => void onCopyLink()}>
                <CopyIcon size={16} weight="bold" />{copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </label>

          <div className="share-card-qr-row">
            <div className="share-card-qr-frame">
              {qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${cardName}`} /> : <span className="skeleton qr-skeleton" />}
            </div>
            <div>
              <strong>{cardName || "Your card"}</strong>
              <small>QR code</small>
              {qrDataUrl ? (
                <LinkButton size="small" variant="secondary" href={qrDataUrl} download={qrDataUrl.startsWith("data:image/svg+xml") ? "ehllo-qr.svg" : "ehllo-qr.png"}>
                  <DownloadSimpleIcon size={16} weight="bold" />Download
                </LinkButton>
              ) : null}
            </div>
          </div>

          <div className="share-card-channel-list">
            <span className="share-card-channel-label">Share via</span>
            <LinkButton fullWidth variant="secondary" href={buildEmailShareUrl(shareUrl, cardName)}>
              <EnvelopeSimpleIcon size={18} weight="bold" />Share via Email
            </LinkButton>
            <LinkButton fullWidth variant="secondary" href={buildSmsShareUrl(shareUrl, cardName)}>
              <PaperPlaneTiltIcon size={18} weight="bold" />Share via Messages
            </LinkButton>
            <LinkButton fullWidth variant="secondary" href={buildLinkedInShareUrl(shareUrl)} target="_blank" rel="noreferrer">
              <LinkedinLogoIcon size={18} weight="bold" />Share via LinkedIn
            </LinkButton>
          </div>
        </div>
      </section>
    </div>
  );
}
