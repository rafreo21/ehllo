"use client";

import { useEffect, useState } from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { CalendarBlankIcon } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import type { ActionLinkContext } from "../../lib/action-links";
import { resolveActionLink, resolveSecondaryActionLinks } from "../../lib/action-links";
import type { EncounterAction } from "../../lib/encounters";
import { emptyConnectedAccountStatus, type ConnectedAccountStatus } from "../../lib/integrations/types";
import { LinkButton } from "./Button";
import { DropdownButton, type DropdownItem } from "./DropdownButton";

type ActionDoButtonProps = {
  action: Pick<EncounterAction, "channel" | "title" | "dueAt" | "status" | "owner">;
  context: ActionLinkContext;
  size?: "small" | "medium";
  showSecondary?: boolean;
};

const TRIGGER_LABEL: Partial<Record<EncounterAction["channel"], string>> = {
  meeting: "Schedule",
  send: "Send the file",
  email: "Send email",
  other: "Send email",
};

export function ActionDoButton({ action, context, size = "small", showSecondary = false }: ActionDoButtonProps) {
  const [integrations, setIntegrations] = useState<ConnectedAccountStatus>(emptyConnectedAccountStatus());
  const [scheduling, setScheduling] = useState<"" | "google" | "microsoft">("");
  const [scheduleMessage, setScheduleMessage] = useState("");
  // Ehllo never auto-sends anything external — creating a private event
  // on your own calendar needs no review, but inviting the other person is
  // an outward-facing action, so it always stops here for an explicit
  // choice instead of firing straight from the dropdown.
  const [pendingProvider, setPendingProvider] = useState<"" | "google" | "microsoft">("");

  useEffect(() => {
    void fetch("/api/integrations/status")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as { status?: ConnectedAccountStatus };
        if (payload.status) setIntegrations(payload.status);
      })
      .catch(() => undefined);
  }, []);

  // A proposed action is still awaiting review confirmation and must not be
  // externally actionable — schedules and sends stay disabled until then.
  if (action.owner !== "me" || action.status === "completed" || action.status === "proposed") return null;

  const primary = resolveActionLink(action, context);
  const secondary = (showSecondary ? resolveSecondaryActionLinks(action, context) : []).filter((link) => {
    if (action.channel !== "meeting") return true;
    if (integrations.google.connected && link.label === "Schedule in Google Calendar") return false;
    if (integrations.microsoft.connected && link.label === "Outlook Calendar") return false;
    return true;
  });
  const buttonSize = size === "medium" ? "normal" : "small";

  async function scheduleViaConnected(provider: "google" | "microsoft", attendeeEmail?: string) {
    const title = action.title.trim() || `Meeting with ${context.personName || "contact"}`;
    const details = `Scheduled from Ehllo${context.encounterTitle ? `: ${context.encounterTitle}` : ""}.`;
    setScheduling(provider);
    setScheduleMessage("");
    try {
      const response = await fetch("/api/integrations/schedule-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, title, details, dueAt: action.dueAt, attendeeEmail }),
      });
      const payload = await response.json() as { error?: string; invited?: boolean };
      if (!response.ok) {
        setScheduleMessage(payload.error || "We couldn’t schedule this meeting.");
        return;
      }
      const calendarName = provider === "google" ? "Google Calendar" : "Outlook Calendar";
      setScheduleMessage(payload.invited
        ? `Scheduled in ${calendarName} and invited ${context.personName || "them"}.`
        : `Scheduled in ${calendarName}.`);
    } catch {
      setScheduleMessage("We couldn’t schedule this meeting.");
    } finally {
      setScheduling("");
      setPendingProvider("");
    }
  }

  if (primary.unavailableReason) {
    return <span className="action-do-unavailable" title={primary.unavailableReason}>{primary.label} unavailable</span>;
  }

  // Meeting always has two providers to choose between — always offer both
  // as a dropdown rather than defaulting to whichever the code picks first.
  if (action.channel === "meeting") {
    const items: DropdownItem[] = [
      integrations.google.connected
        ? { key: "google", label: "Google Calendar", onSelect: () => setPendingProvider("google") }
        : { key: "google", label: "Google Calendar", href: primary.href, external: primary.external },
      integrations.microsoft.connected
        ? { key: "outlook", label: "Outlook Calendar", onSelect: () => setPendingProvider("microsoft") }
        : { key: "outlook", label: "Outlook Calendar", href: secondary.find((link) => link.label === "Outlook Calendar")?.href, external: true },
    ];
    const calendarLabel = pendingProvider === "google" ? "Google Calendar" : "Outlook Calendar";
    return (
      <div className="action-do-group">
        <DropdownButton
          label={TRIGGER_LABEL.meeting}
          icon={<CalendarBlankIcon size={14} weight="bold" />}
          items={items}
          size={buttonSize}
          loading={scheduling !== ""}
        />
        {pendingProvider ? (
          <div className="action-do-confirm" role="group" aria-label={`Confirm ${calendarLabel} event`}>
            <small>Add to {calendarLabel}{action.dueAt ? ` for ${action.dueAt}` : ""}. Nothing sends until you choose below.</small>
            <div className="action-do-confirm-buttons">
              <button
                type="button"
                className="action-do-confirm-button"
                disabled={scheduling !== ""}
                onClick={() => void scheduleViaConnected(pendingProvider)}
              >
                Just block my calendar
              </button>
              {context.personEmail ? (
                <button
                  type="button"
                  className="action-do-confirm-button action-do-confirm-button-primary"
                  disabled={scheduling !== ""}
                  onClick={() => void scheduleViaConnected(pendingProvider, context.personEmail)}
                >
                  Also invite {context.personName || "them"}
                </button>
              ) : null}
              <button
                type="button"
                className="action-do-confirm-button action-do-confirm-button-ghost"
                disabled={scheduling !== ""}
                onClick={() => setPendingProvider("")}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {scheduleMessage ? <span className="action-do-message" role="status">{scheduleMessage}</span> : null}
      </div>
    );
  }

  // Multiple ways to send (Gmail/Outlook/Mail app/Drive) — collapse into one
  // dropdown instead of a button per option. Falls through to the plain
  // single-button case below when there's nothing to choose between (no
  // email on file, so only one delivery method resolved).
  if (secondary.length > 0) {
    const items: DropdownItem[] = [
      { key: "primary", label: primary.label, href: primary.href, external: primary.external },
      ...secondary.map((link) => ({ key: link.label, label: link.label, href: link.href, external: link.external })),
    ];
    return (
      <div className="action-do-group">
        <DropdownButton label={TRIGGER_LABEL[action.channel] ?? primary.label} items={items} size={buttonSize} />
      </div>
    );
  }

  return (
    <div className="action-do-group">
      <LinkButton
        size={buttonSize}
        href={primary.href}
        target={primary.external ? "_blank" : undefined}
        rel={primary.external ? "noreferrer" : undefined}
      >
        {primary.label}
        {primary.external ? <ArrowSquareOutIcon size={14} weight="bold" /> : null}
      </LinkButton>
    </div>
  );
}
