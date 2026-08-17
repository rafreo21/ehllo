"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy as CopyIcon } from "react-feather";
import { GoogleLogoIcon } from "@phosphor-icons/react/dist/csr/GoogleLogo";
import { ContactlessPaymentIcon } from "@phosphor-icons/react/dist/csr/ContactlessPayment";
import { WalletIcon } from "@phosphor-icons/react/dist/csr/Wallet";
import { StatusMessage } from "./AsyncState";
import { Button } from "./Button";
import { isWebNfcSupported, nfcManufacturerPayload, nfcUriRecord } from "../../lib/nfc-ndef";

type WalletSharePanelProps = {
  slug: string;
  shareUrl: string;
};

type NdefReaderLike = {
  write: (message: { records: Array<{ recordType: string; data: string }> }) => Promise<void>;
};

declare global {
  interface Window {
    NDEFReader?: new () => NdefReaderLike;
  }
}

export function WalletSharePanel({ slug, shareUrl }: WalletSharePanelProps) {
  const [appleState, setAppleState] = useState<"idle" | "loading" | "ready" | "unconfigured">("idle");
  const [googleState, setGoogleState] = useState<"idle" | "loading" | "ready" | "unconfigured">("idle");
  const [googleUrl, setGoogleUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [nfcState, setNfcState] = useState<"idle" | "writing" | "done">("idle");
  const [copiedNfc, setCopiedNfc] = useState(false);
  const nfcSupported = useMemo(() => isWebNfcSupported(typeof navigator !== "undefined" ? navigator.userAgent : ""), []);
  const manufacturerPayload = useMemo(() => JSON.stringify(nfcManufacturerPayload(shareUrl), null, 2), [shareUrl]);

  useEffect(() => {
    void fetch(`/api/cards/wallet/google/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        const payload = await response.json() as { configured?: boolean; saveUrl?: string };
        if (response.ok && payload.saveUrl) {
          setGoogleUrl(payload.saveUrl);
          setGoogleState("ready");
          return;
        }
        setGoogleState(payload.configured === false ? "unconfigured" : "idle");
      })
      .catch(() => setGoogleState("idle"));
  }, [slug]);

  async function addAppleWallet() {
    setError("");
    setMessage("");
    setAppleState("loading");
    try {
      const response = await fetch(`/api/cards/wallet/apple/${encodeURIComponent(slug)}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { configured?: boolean; error?: string } | null;
        if (payload?.configured === false) {
          setAppleState("unconfigured");
          setError(payload.error || "Apple Wallet signing is not configured yet.");
          return;
        }
        throw new Error(payload?.error || "We couldn’t create the Apple Wallet pass.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${slug}.pkpass`;
      link.click();
      URL.revokeObjectURL(href);
      setAppleState("ready");
      setMessage("Apple Wallet pass downloaded. Open it on iPhone to add the pass.");
    } catch (caught) {
      setAppleState("ready");
      setError(caught instanceof Error ? caught.message : "We couldn’t create the Apple Wallet pass.");
    }
  }

  async function addGoogleWallet() {
    if (!googleUrl) {
      setError("Google Wallet is not configured for this environment yet.");
      return;
    }
    window.open(googleUrl, "_blank", "noopener,noreferrer");
    setMessage("Google Wallet opened in a new tab.");
  }

  async function programNfcTag() {
    setError("");
    setMessage("");
    if (!window.NDEFReader) {
      setError("Web NFC is only available on supported Android browsers over HTTPS.");
      return;
    }
    setNfcState("writing");
    try {
      const reader = new window.NDEFReader();
      const record = nfcUriRecord(shareUrl);
      await reader.write({ records: [{ recordType: record.recordType, data: record.data }] });
      setNfcState("done");
      setMessage("NFC tag programmed. Tap it with a phone to open your card.");
    } catch (caught) {
      setNfcState("idle");
      setError(caught instanceof Error ? caught.message : "We couldn’t write to the NFC tag.");
    }
  }

  async function copyNfcPayload() {
    await navigator.clipboard.writeText(manufacturerPayload);
    setCopiedNfc(true);
    window.setTimeout(() => setCopiedNfc(false), 1800);
  }

  return (
    <section className="wallet-share-panel">
      <div className="inline-qr-head">
        <span><WalletIcon size={22} weight="bold" /></span>
        <div>
          <h2>Wallet passes and NFC</h2>
          <p>Save your card to Apple or Google Wallet, or program an NFC tag that opens your public link.</p>
        </div>
      </div>

      <div className="wallet-share-actions">
        <Button loading={appleState === "loading"} onClick={() => void addAppleWallet()}>
          <WalletIcon size={18} weight="bold" />Add to Apple Wallet
        </Button>
        <Button
          variant="secondary"
          disabled={googleState === "unconfigured" || !googleUrl}
          onClick={() => void addGoogleWallet()}
        >
          <GoogleLogoIcon size={18} weight="bold" />Add to Google Wallet
        </Button>
      </div>

      {(appleState === "unconfigured" || googleState === "unconfigured") && (
        <StatusMessage tone="error">
          Wallet issuer credentials are not configured in this environment yet. QR, link, and NFC URL programming still work today.
        </StatusMessage>
      )}

      <section className="nfc-share-panel">
        <div className="inline-qr-head compact">
          <span><ContactlessPaymentIcon size={20} weight="bold" /></span>
          <div>
            <h3>Program an NFC tag</h3>
            <p>Write your card URL to a blank NFC sticker, or copy the payload for a badge manufacturer.</p>
          </div>
        </div>
        <div className="inline-qr-url"><span>Tap-to-open URL</span><strong>{shareUrl}</strong></div>
        <div className="wallet-share-actions">
          <Button variant="secondary" loading={nfcState === "writing"} onClick={() => void programNfcTag()} disabled={!nfcSupported}>
            <ContactlessPaymentIcon size={18} weight="bold" />Write NFC tag
          </Button>
          <Button variant="ghost" onClick={() => void copyNfcPayload()}>
            <CopyIcon size={16} />{copiedNfc ? "Payload copied" : "Copy manufacturer payload"}
          </Button>
        </div>
        {!nfcSupported ? (
          <small className="signature-note">Web NFC writing works on supported Android browsers. iPhone can read programmed tags but cannot write them from the browser.</small>
        ) : null}
      </section>

      {message ? <StatusMessage tone="success">{message}</StatusMessage> : null}
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
    </section>
  );
}
