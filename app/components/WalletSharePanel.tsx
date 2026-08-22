"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle as CheckCircleIcon, Copy as CopyIcon } from "react-feather";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { WalletIcon } from "@phosphor-icons/react/dist/csr/Wallet";
import { StatusMessage } from "./AsyncState";
import { Button } from "./Button";
import { isWebNfcSupported, nfcManufacturerPayload, nfcUriRecord } from "../../lib/nfc-ndef";
import { detectMobilePlatform } from "../../lib/app-store-links";
import { useToast } from "./ToastContext";

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
  const { showToast } = useToast();
  const [appleState, setAppleState] = useState<"idle" | "loading" | "ready" | "unconfigured">("idle");
  const [googleState, setGoogleState] = useState<"idle" | "loading" | "ready" | "unconfigured">("idle");
  const [googleUrl, setGoogleUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [nfcState, setNfcState] = useState<"idle" | "writing" | "done">("idle");
  const [copiedNfc, setCopiedNfc] = useState(false);
  const [copiedWalletUrl, setCopiedWalletUrl] = useState(false);
  const [walletState, setWalletState] = useState<"idle" | "opening">("idle");
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
          showToast({ tone: "error", message: payload.error || "Apple Wallet signing is not configured yet." });
          return;
        }
        throw new Error(payload?.error || "We couldn’t create the Apple Wallet pass.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const isIosDevice = detectMobilePlatform(typeof navigator !== "undefined" ? navigator.userAgent : "") === "ios";
      const link = document.createElement("a");
      link.href = href;
      if (isIosDevice) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        link.download = `${slug}.pkpass`;
        link.click();
      }
      URL.revokeObjectURL(href);
      setAppleState("ready");
      setMessage("Apple Wallet pass downloaded. Open it on iPhone to add the pass.");
      showToast({ tone: "success", message: "Apple Wallet pass downloaded. Open it on iPhone to add the pass." });
    } catch (caught) {
      setAppleState("ready");
      setError(caught instanceof Error ? caught.message : "We couldn’t create the Apple Wallet pass.");
      showToast({ tone: "error", message: caught instanceof Error ? caught.message : "We couldn’t create the Apple Wallet pass." });
    }
  }

  async function addGoogleWallet() {
    if (!googleUrl) {
      setError("Google Wallet is not configured for this environment yet.");
      showToast({ tone: "error", message: "Google Wallet is not configured for this environment yet." });
      return;
    }
    window.open(googleUrl, "_blank", "noopener,noreferrer");
    setMessage("Google Wallet opened in a new tab.");
    showToast({ tone: "info", message: "Google Wallet opened in a new tab." });
  }

  async function addWalletInApp() {
    const platform = detectMobilePlatform(typeof navigator !== "undefined" ? navigator.userAgent : "");
    setError("");
    setMessage("");
    setWalletState("opening");
    try {
      if (platform === "ios") {
        if (appleState === "unconfigured") {
          setError("Apple Wallet signing is not configured yet.");
          showToast({ tone: "error", message: "Apple Wallet signing is not configured yet." });
          return;
        }
        await addAppleWallet();
        return;
      }

      if (platform === "android") {
        if (!googleUrl || googleState === "unconfigured") {
          if (appleState !== "unconfigured") {
            await addAppleWallet();
          } else {
            setError("Google Wallet is not configured for this environment yet.");
            showToast({ tone: "error", message: "Google Wallet is not configured for this environment yet." });
          }
          return;
        }
        await addGoogleWallet();
        return;
      }

      if (googleState !== "unconfigured" && googleUrl) {
        setMessage("Desktop detected. Opening Google Wallet link.");
        showToast({ tone: "info", message: "Desktop detected. Opening Google Wallet link." });
        addGoogleWallet();
        return;
      }

      if (appleState !== "unconfigured") {
        setMessage("Wallet app flow not detected. Opening Apple Wallet.");
        showToast({ tone: "info", message: "Wallet app flow not detected. Opening Apple Wallet." });
        await addAppleWallet();
        return;
      }

      setError("Wallet credentials are not configured in this environment yet.");
      showToast({ tone: "error", message: "Wallet credentials are not configured in this environment yet." });
    } finally {
      setWalletState("idle");
    }
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
      showToast({ tone: "success", message: "NFC tag programmed. Tap it with a phone to open your card." });
    } catch (caught) {
      setNfcState("idle");
      setError(caught instanceof Error ? caught.message : "We couldn’t write to the NFC tag.");
      showToast({ tone: "error", message: caught instanceof Error ? caught.message : "We couldn’t write to the NFC tag." });
    }
  }

  async function copyNfcPayload() {
    await navigator.clipboard.writeText(manufacturerPayload);
    setCopiedNfc(true);
    showToast({ tone: "info", message: "NFC payload copied to clipboard." });
    window.setTimeout(() => setCopiedNfc(false), 1800);
  }

  async function copyWalletUrl() {
    await navigator.clipboard.writeText(shareUrl);
    setCopiedWalletUrl(true);
    showToast({ tone: "success", message: "Card link copied." });
    window.setTimeout(() => setCopiedWalletUrl(false), 1400);
  }

  return (
    <section className="wallet-share-panel">
      <div className="inline-qr-head">
        <span><QrCodeIcon size={22} weight="bold" /></span>
        <div>
          <h2 className="qr-scan-title">Wallet passes and NFC</h2>
          <p>Add your card to Apple or Google Wallet, or link it to an NFC tag.</p>
        </div>
      </div>

      <div className="inline-qr-actions">
        <Button size="small" loading={walletState === "opening" || appleState === "loading"} onClick={() => void addWalletInApp()}>
          <WalletIcon size={18} weight="bold" />Open in app
        </Button>
      </div>

      {(appleState === "unconfigured" && googleState === "unconfigured") && (
        <StatusMessage tone="error">
          Wallet issuer credentials are not configured in this environment yet. QR, link, and NFC URL programming still work today.
        </StatusMessage>
      )}

      <section className="nfc-share-panel wallet-nfc-divider">
        <div className="inline-qr-head">
          <span><QrCodeIcon size={22} weight="bold" /></span>
          <div>
            <h2 className="qr-scan-title">Program an NFC tag</h2>
            <p>Write your public card link to a blank NFC tag.</p>
          </div>
        </div>
        <div className="inline-qr-url">
          <span>Tap-to-open URL</span>
          <strong>{shareUrl}</strong>
          <button
            type="button"
            className="review-textfield-copy inline-qr-copy"
            onClick={() => void copyWalletUrl()}
            aria-label="Copy card link"
          >
            {copiedWalletUrl ? <CheckCircleIcon size={14} /> : <CopyIcon size={14} />}
          </button>
        </div>
        <div className="inline-qr-actions">
          <Button size="small" variant="secondary" loading={nfcState === "writing"} onClick={() => void programNfcTag()} disabled={!nfcSupported}>
            <QrCodeIcon size={18} weight="bold" />Write NFC tag
          </Button>
          <Button size="small" variant="ghost" onClick={() => void copyNfcPayload()}>
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
