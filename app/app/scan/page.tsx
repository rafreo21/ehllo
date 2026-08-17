"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera as CameraIcon } from "react-feather";
import { CreditCard as IdentificationCardIcon } from "react-feather";
import { Linkedin as LinkedinLogoIcon } from "react-feather";
import { Mic as MicrophoneIcon } from "react-feather";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { useAppShellChrome } from "../../components/AppShellChromeContext";
import { StatusMessage } from "../../components/AsyncState";
import { Button, LinkButton } from "../../components/Button";
import { CaptureComingSoonModal } from "../../components/CaptureComingSoonModal";
import { TextField } from "../../components/FormField";
import { useToast } from "../../components/ToastContext";
import {
  contactFromPublicCard,
  type Contact,
} from "../../../lib/contacts";
import { resolveAndSaveContact } from "../../../lib/person-links";
import { parseLinkedInProfileInput } from "../../../lib/linkedin-profile";
import { parseScanTarget, type ScanTarget } from "../../../lib/scan-targets";
import {
  availableQrScanEngine,
  buildCameraConstraints,
  detectQrWithBarcodeDetector,
  detectQrWithJsqr,
} from "../../../lib/qr-camera-scan";
import { readActiveCampaignId } from "../../../lib/campaigns";
import { parseVcardSingle } from "../../../lib/vcard";

type PublicCard = {
  slug: string;
  fullName: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  whatsappUrl: string;
  instagramUrl: string;
  xUrl: string;
  tiktokUrl: string;
};

function contactFromScanTarget(target: ScanTarget, card?: PublicCard | null): Contact | null {
  if (target.type === "aftermeet_card" && card) {
    return contactFromPublicCard(card, "badge");
  }
  if (target.type === "linkedin") {
    const profile = parseLinkedInProfileInput(target.url);
    if (!profile) return null;
    return {
      id: `linkedin-${profile.handle}`,
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: "",
      linkedinUrl: profile.url,
      company: "",
      role: "",
      context: "Added from LinkedIn scan.",
      source: "linkedin",
      campaignId: readActiveCampaignId() || undefined,
    };
  }
  if (target.type === "vcard") {
    const parsed = parseVcardSingle(target.text);
    return parsed ? { ...parsed, source: "vcard" } : null;
  }
  if (target.type === "email") {
    return {
      id: crypto.randomUUID(),
      firstName: "",
      lastName: "",
      email: target.email,
      company: "",
      role: "",
      context: "Added from QR scan.",
      source: "scan",
    };
  }
  if (target.type === "phone") {
    return {
      id: crypto.randomUUID(),
      firstName: "",
      lastName: "",
      email: "",
      phone: target.phone,
      company: "",
      role: "",
      context: "Added from QR scan.",
      source: "scan",
    };
  }
  return null;
}

export default function ScanPage() {
  const { showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handledRef = useRef("");
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "scanning" | "unsupported">("idle");
  const [cameraError, setCameraError] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [target, setTarget] = useState<ScanTarget | null>(null);
  const [card, setCard] = useState<PublicCard | null>(null);
  const [loadError, setLoadError] = useState("");
  const [savedContactId, setSavedContactId] = useState("");
  const [captureModalOpen, setCaptureModalOpen] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const handlePayload = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value || handledRef.current === value) return;
    handledRef.current = value;
    stopCamera();
    setCameraState("idle");
    setLoadError("");
    setSavedContactId("");
    const parsed = parseScanTarget(value);
    setTarget(parsed);
    if (parsed.type === "aftermeet_card") {
      const response = await fetch(`/api/cards/public/${encodeURIComponent(parsed.slug)}`);
      if (!response.ok) {
        setLoadError("We found an ehllo card, but it isn’t published yet.");
        setCard(null);
        return;
      }
      const payload = await response.json() as { card?: PublicCard };
      setCard(payload.card ?? null);
    } else {
      setCard(null);
    }
  }, [stopCamera]);

  useEffect(() => {
    if (mode !== "camera" || target) return;
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      void Promise.resolve().then(() => {
        setCameraState("unsupported");
        setCameraError("Camera access isn’t available in this browser. Paste the QR content instead.");
      });
      return;
    }

    const scanEngine = availableQrScanEngine();
    if (!scanEngine) {
      void Promise.resolve().then(() => {
        setCameraState("unsupported");
        setCameraError("QR scanning isn’t available in this browser. Paste the QR content instead.");
      });
      return;
    }

    let active = true;
    void Promise.resolve().then(() => {
      setCameraState("starting");
      setCameraError("");
    });
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");

    void navigator.mediaDevices
      .getUserMedia(buildCameraConstraints(navigator.userAgent))
      .then(async (stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setCameraState("scanning");

        const tick = async () => {
          if (!active || !videoRef.current || handledRef.current) return;
          try {
            const raw = scanEngine === "barcode-detector"
              ? await detectQrWithBarcodeDetector(videoRef.current)
              : detectQrWithJsqr(videoRef.current, canvasRef.current!);
            if (raw) {
              await handlePayload(raw);
              return;
            }
          } catch {
            // Ignore frame-level detection errors and keep scanning.
          }
          if (active) window.requestAnimationFrame(() => void tick());
        };
        void tick();
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCameraState("unsupported");
        const name = error instanceof DOMException ? error.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setCameraError("Camera permission was blocked. Allow camera access in your browser, then try again.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setCameraError("No camera was found on this device. Paste the QR content instead.");
        } else {
          setCameraError("Camera access isn’t available. Paste the QR content instead.");
        }
      });

    return () => {
      active = false;
      stopCamera();
    };
  }, [handlePayload, mode, stopCamera, target]);

  function resetScan() {
    handledRef.current = "";
    setTarget(null);
    setCard(null);
    setLoadError("");
    setSavedContactId("");
    setManualValue("");
    setCameraState("idle");
  }

  function saveContact(contact: Contact | null) {
    if (!contact) return;
    const withCampaign = contact.campaignId ? contact : {
      ...contact,
      campaignId: readActiveCampaignId() || undefined,
    };
    const saved = resolveAndSaveContact(withCampaign);
    setSavedContactId(saved.id);
    showToast({ tone: "success", message: "Saved to your contacts." });
    void fetch("/api/people/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: target?.type === "aftermeet_card" ? target.slug : undefined }),
    }).catch(() => undefined);
  }

  const draftContact = target ? contactFromScanTarget(target, card) : null;

  useAppShellChrome({ backHref: "/app/people" });
  return (
    <>
      <div className="flow-page scan-page">
        {!target ? (
          <>
            <div className="flow-heading">
              <div>
                <h1>Scan a badge or card QR</h1>
                <p>ehllo cards, LinkedIn profile codes, and vCards all work here.</p>
              </div>
            </div>
            <div className="scan-panel">
              <ol className="scan-steps">
                <li><span>1</span>Allow camera access</li>
                <li><span>2</span>Line up the QR code</li>
                <li><span>3</span>Add them or capture the moment</li>
              </ol>
              {mode === "camera" ? (
                <div className="scan-viewport-wrap">
                  {cameraState === "unsupported" ? (
                    <div className="scan-viewport-fallback">
                      <QrCodeIcon size={42} weight="bold" />
                      <p>{cameraError || "Camera scanning isn’t available in this browser."}</p>
                      <Button variant="secondary" onClick={() => setMode("manual")}>Paste QR content</Button>
                    </div>
                  ) : (
                    <>
                      <video ref={videoRef} className="scan-viewport" playsInline muted />
                      <div className="scan-viewport-overlay">
                        <CameraIcon size={18} />
                        {cameraState === "starting" ? "Starting camera…" : "Hold steady over the QR code"}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <form
                  className="scan-manual-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handlePayload(manualValue);
                  }}
                >
                  <TextField
                    label="QR content"
                    hint="Paste a URL, vCard, or anything encoded in the badge."
                    value={manualValue}
                    onChange={(event) => setManualValue(event.target.value)}
                  />
                  <div className="form-actions">
                    <Button type="button" variant="ghost" onClick={() => setMode("camera")}>Use camera</Button>
                    <Button type="submit">Continue</Button>
                  </div>
                </form>
              )}
              {mode === "camera" && cameraState !== "unsupported" ? (
                <div className="scan-secondary-actions">
                  <Button variant="ghost" onClick={() => setMode("manual")}>Paste instead</Button>
                  <LinkButton variant="ghost" href="/business/contacts/linkedin"><LinkedinLogoIcon size={16} />Add from LinkedIn</LinkButton>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <section className="scan-result-card">
            <header>
              <h1>{target.type === "aftermeet_card" ? card?.fullName || `@${target.slug}` : target.type === "linkedin" ? `@${target.handle}` : "Ready to add"}</h1>
              {target.type === "aftermeet_card" && card ? (
                <p>{[card.role, card.company].filter(Boolean).join(" · ") || "ehllo card"}</p>
              ) : null}
            </header>
            {loadError ? <StatusMessage tone="error">{loadError}</StatusMessage> : null}
            {savedContactId ? <StatusMessage tone="success">Saved to your contacts.</StatusMessage> : null}
            <div className="scan-result-actions">
              {draftContact ? (
                <Button onClick={() => saveContact(draftContact)}>
                  <IdentificationCardIcon size={18} />Add to contacts
                </Button>
              ) : null}
              {savedContactId ? (
                <LinkButton variant="secondary" href={`/business/contacts/${savedContactId}`}>Open contact</LinkButton>
              ) : null}
              {draftContact ? (
                <Button variant="secondary" onClick={() => setCaptureModalOpen(true)}>
                  <MicrophoneIcon size={18} />Capture moment
                </Button>
              ) : null}
              {target.type === "aftermeet_card" ? (
                <LinkButton variant="ghost" href={`/c/${target.slug}`}>Open public card</LinkButton>
              ) : null}
              {target.type === "linkedin" ? (
                <LinkButton variant="ghost" href={target.url} target="_blank" rel="noreferrer">Open LinkedIn</LinkButton>
              ) : null}
              {target.type === "url" ? (
                <LinkButton variant="ghost" href={target.url} target="_blank" rel="noreferrer">Open link</LinkButton>
              ) : null}
              {target.type === "linkedin" ? (
                <LinkButton href={`/business/contacts/linkedin?url=${encodeURIComponent(target.url)}`}>Review LinkedIn import</LinkButton>
              ) : null}
            </div>
            <div className="form-actions">
              <Button variant="ghost" onClick={resetScan}>Scan another</Button>
            </div>
          </section>
        )}
      </div>

      <CaptureComingSoonModal open={captureModalOpen} onClose={() => setCaptureModalOpen(false)} />
    </>
  );
}
