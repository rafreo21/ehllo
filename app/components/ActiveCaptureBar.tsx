"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight as ArrowRightIcon } from "react-feather";
import { Mic as MicrophoneIcon } from "react-feather";
import { LinkButton } from "./Button";

type ActiveCaptureSession = {
  encounterId: string;
  sessionStatus?: string;
  durationSeconds?: number;
  title?: string;
  personName?: string;
  people?: Array<{ name?: string }>;
  deviceLabel?: string;
  failureReason?: string;
};

function formatElapsed(totalSeconds = 0) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.max(0, Math.round(totalSeconds) % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function statusLabel(status?: string) {
  if (status === "recording") return "Recording";
  if (status === "paused") return "Paused";
  if (status === "processing") return "Preparing review";
  if (status === "failed") return "Recording interrupted";
  return "Capture draft";
}

export function ActiveCaptureBar() {
  const pathname = usePathname();
  const [session, setSession] = useState<ActiveCaptureSession | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch("/api/capture-sessions", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { sessions?: ActiveCaptureSession[] };
      setSession(payload.sessions?.[0] ?? null);
    } catch {
      // A disconnected browser should not interrupt the current page.
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadSession);
    const refresh = () => {
      if (document.visibilityState !== "hidden") void loadSession();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(interval);
    };
  }, [loadSession, pathname]);

  if (!session || pathname === "/app/encounters/new") return null;

  const name = session.title?.trim()
    || session.personName?.trim()
    || session.people?.find((person) => person.name?.trim())?.name
    || "Untitled interaction";
  const interrupted = session.sessionStatus === "failed";

  return (
    <aside
      className={`active-capture-bar${interrupted ? " active-capture-bar-interrupted" : ""}`}
      aria-label={interrupted ? "Interrupted capture" : "Active capture"}
    >
      <span className="active-capture-bar-icon"><MicrophoneIcon size={20} /></span>
      <div className="active-capture-bar-copy">
        <small>{statusLabel(session.sessionStatus)}</small>
        <strong>{name}</strong>
        <span>{interrupted && session.failureReason === "recording_heartbeat_lost"
          ? "Your draft is safe · audio may remain on the recording device"
          : `${formatElapsed(session.durationSeconds)}${session.deviceLabel ? ` · ${session.deviceLabel}` : ""}`}</span>
      </div>
      <LinkButton
        size="small"
        href={`/app/encounters/new?draftId=${encodeURIComponent(session.encounterId)}`}
      >
        {interrupted ? "Review draft" : "Continue"} <ArrowRightIcon size={15} />
      </LinkButton>
    </aside>
  );
}
