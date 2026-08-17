"use client";

import { useEffect } from "react";
import { Copy as CopyIcon } from "react-feather";
import { Download as DownloadSimpleIcon } from "react-feather";
import { Mail as EnvelopeSimpleIcon } from "react-feather";
import { Linkedin as LinkedinLogoIcon } from "react-feather";
import { Send as PaperPlaneTiltIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { X as XIcon } from "react-feather";
import {
  buildEmailShareUrl,
  buildLinkedInShareUrl,
  buildSmsShareUrl,
} from "../../lib/card-share-links";
import { LinkButton } from "./Button";

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
    <div className="connections-modal-backdrop add-followup-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="share-card-modal connections-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-card-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="share-card-title">Share card</h2>
          <button type="button" aria-label="Close share card" onClick={onClose}><XIcon size={18} /></button>
        </header>

        <div className="share-card-modal-body">
          <div className="inline-qr-url">
            <span>Public card link</span>
            <strong title={shareUrl}>{shareUrl}</strong>
            <button
              type="button"
              className="review-textfield-copy inline-qr-copy"
              onClick={() => void onCopyLink()}
              aria-label="Copy card link"
            >
              {copied ? <CheckCircleIcon size={14} /> : <CopyIcon size={14} />}
            </button>
          </div>

          <div className="share-card-qr-row">
            <div className="share-card-qr-frame">
              {qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${cardName}`} /> : <span className="skeleton qr-skeleton" />}
            </div>
            <div>
              <strong>{cardName || "Your card"}</strong>
              <small>QR code</small>
              {qrDataUrl ? (
                <LinkButton size="small" variant="secondary" href={qrDataUrl} download={qrDataUrl.startsWith("data:image/svg+xml") ? "ehllo-qr.svg" : "ehllo-qr.png"}>
                  <DownloadSimpleIcon size={16} />Download QR
                </LinkButton>
              ) : null}
            </div>
          </div>

          <div className="share-card-channel-list">
            <span className="share-card-channel-label">Share via</span>
            <div className="share-card-channel-buttons">
              <LinkButton size="small" variant="secondary" href={buildEmailShareUrl(shareUrl, cardName)}>
                <EnvelopeSimpleIcon size={18} />Share via Email
              </LinkButton>
              <LinkButton size="small" variant="secondary" href={buildSmsShareUrl(shareUrl, cardName)}>
                <PaperPlaneTiltIcon size={18} />Share via Messages
              </LinkButton>
              <LinkButton size="small" variant="secondary" href={buildLinkedInShareUrl(shareUrl)} target="_blank" rel="noreferrer">
                <LinkedinLogoIcon size={18} />Share via LinkedIn
              </LinkButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
