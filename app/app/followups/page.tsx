"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { Clock as ClockIcon } from "react-feather";
import { Search as MagnifyingGlassIcon } from "react-feather";
import { Mic as MicrophoneIcon } from "react-feather";
import { Send as PaperPlaneTiltIcon } from "react-feather";
import { Plus as PlusIcon } from "react-feather";
import { SortAscendingIcon } from "@phosphor-icons/react/dist/csr/SortAscending";
import { X as XIcon } from "react-feather";
import { AddFollowUpModal } from "../../components/AddFollowUpModal";
import { EncounterDrawerView } from "../../components/EncounterDrawerView";
import { PageSkeleton, StatusMessage } from "../../components/AsyncState";
import { Button, LinkButton } from "../../components/Button";
import { CaptureComingSoonModal } from "../../components/CaptureComingSoonModal";
import { FollowUpDetailDrawer } from "../../components/FollowUpDetailDrawer";
import { InlineEditField } from "../../components/InlineEditField";
import { useToast } from "../../components/ToastContext";
import { channelLabel } from "../../../lib/action-links";
import { hydrateContactsFromServer } from "../../../lib/contacts-sync";
import { encounterToApiBody, readEncounters, updateEncounter, type Encounter, type EncounterAction } from "../../../lib/encounters";
import { isFollowUpTerminal } from "../../../lib/follow-up-lifecycle";
import { hydrateEncountersFromServer } from "../../../lib/encounters-sync";
import { recordCompletedAction } from "../../../lib/outbound-habit";

type Contact = { firstName: string; lastName: string; company: string; context: string; nextAction: string };
type FollowUpScope = "current" | "past";
type FollowUpGroup = { encounter: Encounter; actions: EncounterAction[] };
type FollowUpsSort = "urgency" | "recent" | "az";

const FOLLOWUPS_PAGE_SIZE = 10;

function dueBucket(dueAt?: string) {
  if (!dueAt?.trim()) return 4;
  const due = new Date(`${dueAt.slice(0, 10)}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (due < today) return 0;
  if (due.getTime() === today.getTime()) return 1;
  const endOfWeek = new Date(today);
  const day = endOfWeek.getDay();
  endOfWeek.setDate(endOfWeek.getDate() + (day === 0 ? 0 : 7 - day));
  if (due <= endOfWeek) return 2;
  return 3;
}

function filterFollowUpGroups(groups: FollowUpGroup[], query: string, channel: string) {
  const needle = query.trim().toLowerCase();
  let filtered = groups;
  if (needle) {
    filtered = filtered.filter(({ encounter, actions }) => (
      (encounter.personName || "").toLowerCase().includes(needle)
      || encounter.title.toLowerCase().includes(needle)
      || actions.some((action) => action.title.toLowerCase().includes(needle) || action.channel.toLowerCase().includes(needle))
    ));
  }
  if (channel) {
    filtered = filtered
      .map((group) => ({ ...group, actions: group.actions.filter((action) => action.channel === channel) }))
      .filter((group) => group.actions.length > 0);
  }
  return filtered;
}

function sortFollowUpGroups(groups: FollowUpGroup[], sort: FollowUpsSort) {
  const next = [...groups];
  if (sort === "az") {
    next.sort((left, right) => (left.encounter.personName || "").localeCompare(right.encounter.personName || "", undefined, { sensitivity: "base" }));
    return next;
  }
  if (sort === "recent") {
    next.sort((left, right) => {
      const leftDate = left.actions[0]?.completedAt || left.encounter.startedAt;
      const rightDate = right.actions[0]?.completedAt || right.encounter.startedAt;
      return rightDate.localeCompare(leftDate);
    });
    return next;
  }
  next.sort((left, right) => {
    const leftBucket = Math.min(...left.actions.map((action) => dueBucket(action.dueAt)));
    const rightBucket = Math.min(...right.actions.map((action) => dueBucket(action.dueAt)));
    if (leftBucket !== rightBucket) return leftBucket - rightBucket;
    return right.encounter.startedAt.localeCompare(left.encounter.startedAt);
  });
  return next;
}

function participantName(encounter: Encounter, action: EncounterAction) {
  if (action.owner !== "guest") return "You";
  const matched = action.participantId
    ? encounter.participants?.find((person) => person.id === action.participantId)
    : null;
  return matched?.name.trim() || encounter.personName || "Guest";
}

function completedLabel(completedAt?: string) {
  if (!completedAt) return "Completed";
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return "Completed";
  return `Completed ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function addedLabel(startedAt?: string) {
  if (!startedAt) return "-";
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function FollowupsPage() {
  const searchParams = useSearchParams();
  const [contact, setContact] = useState<Contact | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [done, setDone] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // Commitments somebody else recorded that name you, from their own meeting. The
  // page builds everything else from encounters in your workspace, and these are by
  // definition not there - so without this the web simply never showed them, while
  // mobile did.
  const [addressedToMe, setAddressedToMe] = useState<{
    id: string;
    note: string;
    fromName: string;
    meetingTitle: string;
    dueAt: string;
  }[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [scope, setScope] = useState<FollowUpScope>("current");
  const [query, setQuery] = useState(() => searchParams.get("person")?.trim() ?? "");
  const [channelFilter, setChannelFilter] = useState("");
  const [sort, setSort] = useState<FollowUpsSort>("urgency");
  const [sortOpen, setSortOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [activeAction, setActiveAction] = useState<{ encounter: Encounter; action: EncounterAction } | null>(null);
  const [captureModalOpen, setCaptureModalOpen] = useState(false);
  const [addFollowUpModalOpen, setAddFollowUpModalOpen] = useState(false);
  const [activeEncounterId, setActiveEncounterId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const { showToast } = useToast();

  async function loadEncounters(isRetry = false) {
    if (isRetry) setRetrying(true);
    setError("");
    try { const value = localStorage.getItem("aftermeet-last-contact-v1"); if (value) setContact(JSON.parse(value)); } catch {}
    try {
      const [, nextEncounters] = await Promise.all([
        hydrateContactsFromServer(),
        hydrateEncountersFromServer(),
      ]);
      setEncounters(nextEncounters);
      // Best effort and deliberately outside the Promise.all: this is an addition to
      // the page, and failing to load it must not take the whole list down with it.
      void fetch("/api/follow-ups")
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { addressedToMe?: Record<string, unknown>[] } | null) => {
          setAddressedToMe((payload?.addressedToMe ?? []).map((row) => ({
            id: String(row.id ?? ""),
            note: String(row.note ?? ""),
            fromName: String(row.fromName ?? ""),
            meetingTitle: String(row.meetingTitle ?? ""),
            dueAt: String(row.dueAt ?? ""),
          })));
        })
        .catch(() => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t load your follow-ups. Check your connection and try again.");
    } finally {
      setHydrated(true);
      setRetrying(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadEncounters());
  }, []);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState !== "hidden") void loadEncounters();
    }
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(interval);
    };
  }, []);

  const allActions = useMemo(
    // A follow-up proposed during capture stays attached to its encounter
    // while review is pending; it must not surface here as actionable until
    // the encounter has been reviewed. Mirrors flattenOpenFollowUps' gate.
    () => encounters
      .filter((encounter) => encounter.status !== "draft")
      .flatMap((encounter) => encounter.actions
        .filter((action) => action.status !== "proposed")
        .map((action) => ({ encounter, action }))),
    [encounters],
  );
  const visibleActions = useMemo(
    () => {
      const filtered = allActions.filter(({ action }) => (
        scope === "past" ? isFollowUpTerminal(action.status) : !isFollowUpTerminal(action.status)
      ));
      if (scope !== "past") return filtered;
      return [...filtered].sort((left, right) => (
        (right.action.completedAt || right.encounter.startedAt)
          .localeCompare(left.action.completedAt || left.encounter.startedAt)
      ));
    },
    [allActions, scope],
  );
  const rawFollowUpGroups = useMemo(() => {
    const groups = new Map<string, FollowUpGroup>();
    for (const { encounter, action } of visibleActions) {
      const current = groups.get(encounter.id);
      if (current) current.actions.push(action);
      else groups.set(encounter.id, { encounter, actions: [action] });
    }
    return Array.from(groups.values());
  }, [visibleActions]);
  const followUpGroups = useMemo(
    () => sortFollowUpGroups(filterFollowUpGroups(rawFollowUpGroups, query, channelFilter), sort),
    [rawFollowUpGroups, query, channelFilter, sort],
  );
  const availableChannels = useMemo(
    () => Array.from(new Set(rawFollowUpGroups.flatMap(({ actions }) => actions.map((action) => action.channel)))),
    [rawFollowUpGroups],
  );
  const flatFollowUpRows = useMemo(
    () => followUpGroups.flatMap(({ encounter, actions }) => actions.map((action) => ({ encounter, action }))),
    [followUpGroups],
  );
  const totalPages = Math.max(1, Math.ceil(flatFollowUpRows.length / FOLLOWUPS_PAGE_SIZE));
  const pagedFollowUpRows = useMemo(
    () => flatFollowUpRows.slice((page - 1) * FOLLOWUPS_PAGE_SIZE, page * FOLLOWUPS_PAGE_SIZE),
    [flatFollowUpRows, page],
  );
  /* eslint-disable react-hooks/set-state-in-effect -- these resets have to land in
     the same commit as the filter change. Deferred, the list paints once with the
     new filter and the old page index, which shows an empty page 5 of a
     one-page result before correcting itself. */
  useEffect(() => { setPage(1); }, [query, channelFilter, sort, scope]);
  useEffect(() => { setPage((current) => Math.min(current, totalPages)); }, [totalPages]);
  useEffect(() => { setSelectedIds(new Set()); }, [page, query, channelFilter, sort, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectableRows = useMemo(() => pagedFollowUpRows.filter(({ action }) => !isFollowUpTerminal(action.status)), [pagedFollowUpRows]);
  const pageAllSelected = selectableRows.length > 0 && selectableRows.every(({ action }) => selectedIds.has(action.id));

  function toggleSelected(actionId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(actionId)) next.delete(actionId);
      else next.add(actionId);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (pageAllSelected) {
        for (const { action } of selectableRows) next.delete(action.id);
      } else {
        for (const { action } of selectableRows) next.add(action.id);
      }
      return next;
    });
  }

  async function bulkApply(kind: "snooze" | "dismiss" | "done") {
    const targets = flatFollowUpRows.filter(({ action }) => selectedIds.has(action.id));
    if (!targets.length) return;
    setBulkBusy(true);
    for (const { encounter, action } of targets) {
      if (kind === "snooze") snoozeAction(encounter.id, action.id);
      else if (kind === "dismiss") dismissAction(encounter.id, action.id);
      else completeAction(encounter.id, action.id);
    }
    setSelectedIds(new Set());
    setBulkBusy(false);
  }
  const guestCommitments = useMemo(() => encounters.flatMap((encounter) => {
    const rows = encounter.guestFollowUps?.length
      ? encounter.guestFollowUps
      : encounter.guestFollowUp
        ? [encounter.guestFollowUp]
        : [];
    return rows
      .filter((commitment) => commitment.note?.trim())
      .map((commitment, index) => ({
        encounter,
        commitment,
        key: commitment.id || `${encounter.id}-${commitment.committedAt}-${index}`,
      }));
  }), [encounters]);

  function completeAction(encounterId: string, actionId: string) {
    const completedAt = new Date().toISOString();
    const updated = updateEncounter(encounterId, (encounter) => ({ ...encounter, actions: encounter.actions.map((action) => action.id === actionId ? { ...action, status: "completed", completedAt, snoozedUntil: undefined, statusUpdatedAt: completedAt } : action) }));
    const action = updated?.actions.find((item) => item.id === actionId);
    if (action) void patchAction(encounterId, action);
    recordCompletedAction();
    setEncounters(readEncounters());
    setMessage("Follow-up marked complete.");
    showToast({ tone: "success", message: "Follow-up marked complete." });
  }

  function reopenAction(encounterId: string, actionId: string) {
    const updated = updateEncounter(encounterId, (encounter) => ({
      ...encounter,
      actions: encounter.actions.map((action) => action.id === actionId
        ? { ...action, status: "open", completedAt: undefined, dismissedAt: undefined, cancelledAt: undefined, snoozedUntil: undefined, statusUpdatedAt: new Date().toISOString() }
        : action),
    }));
    const action = updated?.actions.find((item) => item.id === actionId);
    if (action) void patchAction(encounterId, action);
    setEncounters(readEncounters());
    setMessage("Follow-up moved back to Current.");
    showToast({ tone: "success", message: "Follow-up moved back to Current." });
  }

  function snoozeAction(encounterId: string, actionId: string) {
    const snoozeTarget = new Date();
    snoozeTarget.setDate(snoozeTarget.getDate() + 1);
    const snoozedUntil = snoozeTarget.toISOString();
    const updated = updateEncounter(encounterId, (encounter) => ({
      ...encounter,
      actions: encounter.actions.map((action) => action.id === actionId
        ? { ...action, status: "snoozed", snoozedUntil, statusUpdatedAt: new Date().toISOString() }
        : action),
    }));
    const action = updated?.actions.find((item) => item.id === actionId);
    if (action) void patchAction(encounterId, action);
    setEncounters(readEncounters());
    setMessage("Follow-up snoozed until tomorrow.");
    showToast({ tone: "success", message: "Follow-up snoozed until tomorrow." });
  }

  function dismissAction(encounterId: string, actionId: string) {
    const dismissedAt = new Date().toISOString();
    const updated = updateEncounter(encounterId, (encounter) => ({
      ...encounter,
      actions: encounter.actions.map((action) => action.id === actionId
        ? { ...action, status: "dismissed", dismissedAt, statusUpdatedAt: dismissedAt }
        : action),
    }));
    const action = updated?.actions.find((item) => item.id === actionId);
    if (action) void patchAction(encounterId, action);
    setEncounters(readEncounters());
    setMessage("Follow-up dismissed. You can reopen it from Past.");
    showToast({ tone: "success", message: "Follow-up dismissed. You can reopen it from Past." });
  }

  async function patchAction(encounterId: string, action: EncounterAction) {
    const response = await fetch(`/api/encounters/${encodeURIComponent(encounterId)}/actions/${encodeURIComponent(action.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      const message = "This change is saved locally but could not sync. Try again when you’re online.";
      setMessage(message);
      showToast({ tone: "error", message });
    }
  }

  function updateActionInline(encounterId: string, actionId: string, patch: Partial<EncounterAction>) {
    const updated = updateEncounter(encounterId, (encounter) => ({
      ...encounter,
      actions: encounter.actions.map((action) => action.id === actionId ? { ...action, ...patch } : action),
    }));
    const action = updated?.actions.find((item) => item.id === actionId);
    if (action) void patchAction(encounterId, action);
    setEncounters(readEncounters());
  }

  function updatePersonInline(encounterId: string, personName: string) {
    const updated = updateEncounter(encounterId, (encounter) => ({ ...encounter, personName }));
    if (!updated) return;
    setEncounters(readEncounters());
    void fetch("/api/encounters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(encounterToApiBody(updated)),
    }).catch(() => undefined);
  }

  return (
    <>
      <div className="flow-page">
        <div className="flow-heading"><div><h1>Keep the promise.</h1><p className="flow-heading-copy-wide">Nothing is sent automatically. Review the context, take the action, then mark it complete.</p></div><div className="flow-heading-actions"><Button size="small" variant="secondary" onClick={() => setAddFollowUpModalOpen(true)}><PlusIcon size={15} />Add follow-up</Button><Button size="small" onClick={() => setCaptureModalOpen(true)}><MicrophoneIcon size={15} />Capture</Button></div></div>
        {message && <StatusMessage tone="success" action={<Button size="small" variant="ghost" onClick={() => setMessage("")}>Dismiss</Button>}>{message}</StatusMessage>}
        {error && (
          <StatusMessage
            tone="error"
            action={<Button size="small" variant="secondary" disabled={retrying} onClick={() => void loadEncounters(true)}>{retrying ? "Retrying…" : "Retry"}</Button>}
          >
            {error}
          </StatusMessage>
        )}
        <div className="followups-tabs">
          <button type="button" className={scope === "current" ? "active" : ""} onClick={() => setScope("current")}>Current</button>
          <button type="button" className={scope === "past" ? "active" : ""} onClick={() => setScope("past")}>Past</button>
        </div>
        {hydrated && rawFollowUpGroups.length ? (
          <p className="followup-count-caption">
            {followUpGroups.length
              ? `${followUpGroups.reduce((total, group) => total + group.actions.length, 0)} ${followUpGroups.reduce((total, group) => total + group.actions.length, 0) === 1 ? "action" : "actions"} across ${followUpGroups.length} ${followUpGroups.length === 1 ? "meeting" : "meetings"}`
              : "No follow-ups match your search."}
          </p>
        ) : null}
        {hydrated && scope === "current" && guestCommitments.length ? (
          <section className="guest-commitments" aria-labelledby="guest-commitments-heading">
            <header>
              <div><h2 id="guest-commitments-heading">What others said they&apos;ll do</h2></div>
              <small>These are confirmations, not tasks assigned to you.</small>
            </header>
            <div className="inbox-list">
              {guestCommitments.map(({ encounter, commitment, key }) => (
                <article className="inbox-item guest-commitment-item" key={key}>
                  <CheckCircleIcon size={22} />
                  <div>
                    <h2>{commitment.note}</h2>
                    <p>{commitment.guestName || encounter.personName || "Meeting participant"} <span className="owner-tag">Confirmed</span>{" · "}{encounter.title}</p>
                    <small>{commitment.channel ? `${commitment.channel} · ` : ""}{commitment.dueAt ? `Due ${commitment.dueAt} · ` : ""}Shared {new Date(commitment.committedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>
                  </div>
                  <div className="inbox-actions"><Button size="small" variant="secondary" onClick={() => setActiveEncounterId(encounter.id)}>Review context</Button></div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {hydrated && scope === "current" && addressedToMe.length ? (
          <section className="guest-commitments" aria-labelledby="addressed-to-me-heading">
            <header>
              <div><h2 id="addressed-to-me-heading">Recorded about you</h2></div>
              <small>Someone noted these during their own meeting. They are not in your meetings, so they live here.</small>
            </header>
            <div className="inbox-list">
              {addressedToMe.map((item) => (
                <article className="inbox-item guest-commitment-item" key={item.id}>
                  <CheckCircleIcon size={22} />
                  <div>
                    <h2>{item.note}</h2>
                    <p>{item.fromName || "Someone"} <span className="owner-tag">Noted</span>{item.meetingTitle ? ` · ${item.meetingTitle}` : ""}</p>
                    {item.dueAt ? <small>Due {new Date(item.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {!hydrated ? <PageSkeleton rows={3} /> : rawFollowUpGroups.length ? (
          <section className="followup-plan" aria-labelledby="your-followups-heading">
            <h2 id="your-followups-heading" className="sr-only">{scope === "current" ? "Your follow-ups" : "Past follow-ups"}</h2>
            <div className="followup-groups">
              <div className="data-table-shell">
                <div className="table-toolbar">
                  {selectedIds.size ? (
                    <div className="table-bulk-actions">
                      <span className="followup-count-caption">{selectedIds.size} selected</span>
                      <Button size="small" variant="secondary" disabled={bulkBusy} onClick={() => void bulkApply("snooze")}><ClockIcon size={14} />Snooze</Button>
                      <Button size="small" variant="secondary" disabled={bulkBusy} onClick={() => void bulkApply("done")}><CheckCircleIcon size={14} />Done</Button>
                      <Button size="small" variant="secondary" disabled={bulkBusy} onClick={() => void bulkApply("dismiss")}>Dismiss</Button>
                      <Button size="small" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                    </div>
                  ) : (
                    <label className="connections-search">
                      <MagnifyingGlassIcon size={18} />
                      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search follow-ups" />
                    </label>
                  )}
                  <div className="table-toolbar-right">
                    {!selectedIds.size && availableChannels.length > 1 ? (
                      <select
                        className="table-channel-filter"
                        value={channelFilter}
                        onChange={(event) => setChannelFilter(event.target.value)}
                        aria-label="Filter by channel"
                      >
                        <option value="">All channels</option>
                        {availableChannels.map((channel) => (
                          <option key={channel} value={channel}>{channelLabel(channel)}</option>
                        ))}
                      </select>
                    ) : null}
                    <Button size="small" variant="secondary" className="table-toolbar-sort" onClick={() => setSortOpen(true)} aria-label="Sort follow-ups">
                      <SortAscendingIcon size={16} weight="bold" />
                      {sort === "urgency" ? "Priority" : sort === "recent" ? "Most recent" : "A–Z"}
                    </Button>
                  </div>
                </div>
                {followUpGroups.length ? (
                  <table className="data-table followup-table">
                    <thead>
                      <tr>
                        <th scope="col" className="table-checkbox-cell">
                          <input
                            type="checkbox"
                            aria-label="Select all on this page"
                            checked={pageAllSelected}
                            onChange={toggleSelectAllOnPage}
                          />
                        </th>
                        <th scope="col">Channel</th>
                        <th scope="col">Follow-up</th>
                        <th scope="col">Person</th>
                        <th scope="col">Owner</th>
                        <th scope="col">Date added</th>
                        <th scope="col">Due</th>
                        <th scope="col"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                  {pagedFollowUpRows.map(({ encounter, action }) => {
                    const isPast = isFollowUpTerminal(action.status);
                    return (
                      <tr className="followup-table-row" key={action.id}>
                        <td className="table-checkbox-cell">
                          {!isPast ? (
                            <input
                              type="checkbox"
                              aria-label={`Select ${action.title}`}
                              checked={selectedIds.has(action.id)}
                              onChange={() => toggleSelected(action.id)}
                            />
                          ) : null}
                        </td>
                        <td data-label="Channel"><span className="inbox-channel">{channelLabel(action.channel)}</span></td>
                        <td data-label="Follow-up" className="followup-title-cell">
                          <InlineEditField
                            key={`${action.id}-${action.title}`}
                            defaultValue={action.title}
                            onConfirm={(value) => updateActionInline(encounter.id, action.id, { title: value })}
                            placeholder="Add follow-up"
                            ariaLabel="Follow-up title"
                          />
                        </td>
                        <td data-label="Person">
                          <InlineEditField
                            key={`${encounter.id}-${encounter.personName}`}
                            defaultValue={encounter.personName || ""}
                            onConfirm={(value) => updatePersonInline(encounter.id, value)}
                            placeholder="Add person"
                            ariaLabel="Person name"
                          />
                        </td>
                        <td data-label="Owner">{participantName(encounter, action)}{action.owner === "guest" ? <span className="owner-tag">Their turn</span> : null}</td>
                        <td data-label="Date added"><span className="table-date"><ClockIcon size={14} />{addedLabel(encounter.startedAt)}</span></td>
                        <td data-label={isPast ? "Completed" : "Due"}>{isPast ? <span className="table-date"><ClockIcon size={14} />{completedLabel(action.completedAt)}</span> : (
                          <input
                            className="table-inline-date"
                            type="date"
                            aria-label={`Due date for ${action.title}`}
                            value={action.dueAt?.slice(0, 10) || ""}
                            onChange={(event) => updateActionInline(encounter.id, action.id, { dueAt: event.target.value })}
                          />
                        )}</td>
                        <td className="table-open-cell">
                          {isPast ? (
                            <Button size="small" variant="secondary" onClick={() => reopenAction(encounter.id, action.id)}>Reopen</Button>
                          ) : (
                            <Button size="small" variant="secondary" onClick={() => setActiveAction({ encounter, action })}>Open</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                    </tbody>
                  </table>
                ) : (
                  <div className="connections-empty-search">
                    <span className="connections-empty-search-icon"><MagnifyingGlassIcon size={20} /></span>
                    <strong>No follow-ups match your search</strong>
                    <span>Try a different name or channel, or clear your filters.</span>
                  </div>
                )}
                {totalPages > 1 ? (
                    <nav className="table-pagination" aria-label="Follow-ups pagination">
                      <span className="table-pagination-summary">
                        Showing {(page - 1) * FOLLOWUPS_PAGE_SIZE + 1}–{Math.min(page * FOLLOWUPS_PAGE_SIZE, flatFollowUpRows.length)} of {flatFollowUpRows.length}
                      </span>
                      <div className="table-pagination-controls">
                        <Button size="small" variant="secondary" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                        {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
                          <button
                            key={number}
                            type="button"
                            className={`table-page-button${number === page ? " active" : ""}`}
                            aria-current={number === page ? "page" : undefined}
                            onClick={() => setPage(number)}
                          >
                            {number}
                          </button>
                        ))}
                        <Button size="small" variant="secondary" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</Button>
                      </div>
                    </nav>
                  ) : null}
                </div>
            </div>
          </section>
            ) : scope === "current" && contact ? <div className="follow-list"><article className="follow-card"><div><h2>{contact.firstName} {contact.lastName}{contact.company ? ` · ${contact.company}` : ""}</h2><p>{contact.nextAction || "Send a thoughtful follow-up based on the meeting context."}</p>{contact.context && <p><strong>Context:</strong> {contact.context}</p>}</div>{done ? <CheckCircleIcon size={42} /> : <Button onClick={() => { setDone(true); setMessage("Follow-up marked complete."); showToast({ tone: "success", message: "Follow-up marked complete." }); }}><PaperPlaneTiltIcon size={18} />Mark complete</Button>}</article></div> : error ? (
          <div className="empty-state">
            <div>
              <span className="empty-icon"><PaperPlaneTiltIcon size={32} /></span>
              <h2>Couldn’t load your follow-ups</h2>
              <p>We couldn’t confirm whether anything is due. This isn’t the same as being caught up. Check your connection and try again.</p>
              <div className="empty-state-actions">
                <Button disabled={retrying} onClick={() => void loadEncounters(true)}>{retrying ? "Retrying…" : "Retry"}</Button>
              </div>
            </div>
          </div>
        ) : <div className="empty-state"><div><span className="empty-icon"><PaperPlaneTiltIcon size={32} /></span><h2>{scope === "current" ? "Your Inbox is clear" : "No past follow-ups yet"}</h2><p>{scope === "current" ? "Add a next step directly, or capture a conversation and turn its commitments into follow-ups." : "Completed follow-ups will appear here after you check them off."}</p>{scope === "current" ? <div className="empty-state-actions"><Button onClick={() => setAddFollowUpModalOpen(true)}><PlusIcon size={16} />Add follow-up</Button><Button variant="secondary" onClick={() => setCaptureModalOpen(true)}>Capture conversation</Button></div> : null}</div></div>}
      </div>

      {sortOpen ? (
        <div className="connections-modal-backdrop" role="presentation" onClick={() => setSortOpen(false)}>
          <div className="connections-modal connections-modal-compact" role="dialog" aria-label="Sort by" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Sort by</h2>
              <button type="button" aria-label="Close" onClick={() => setSortOpen(false)}><XIcon size={18} /></button>
            </header>
            <div className="connections-add-options">
              <Button variant={sort === "urgency" ? "primary" : "secondary"} onClick={() => { setSort("urgency"); setSortOpen(false); }}>Priority</Button>
              <Button variant={sort === "recent" ? "primary" : "secondary"} onClick={() => { setSort("recent"); setSortOpen(false); }}>Most recent</Button>
              <Button variant={sort === "az" ? "primary" : "secondary"} onClick={() => { setSort("az"); setSortOpen(false); }}>A–Z</Button>
            </div>
          </div>
        </div>
      ) : null}

      {activeAction ? (
        <FollowUpDetailDrawer
          encounterId={activeAction.encounter.id}
          actionId={activeAction.action.id}
          onClose={() => setActiveAction(null)}
          onChanged={() => setEncounters(readEncounters())}
        />
      ) : null}

      {activeEncounterId ? (
        <div className="followup-drawer-backdrop" role="presentation" onClick={() => setActiveEncounterId("") }>
          <div className="followup-drawer" role="dialog" aria-label="Review context" onClick={(event) => event.stopPropagation()}>
            <div className="followup-drawer-header">
              <h2>Review context</h2>
            </div>
            <EncounterDrawerView encounterId={activeEncounterId} />
          </div>
        </div>
      ) : null}

      <CaptureComingSoonModal open={captureModalOpen} onClose={() => setCaptureModalOpen(false)} />
      <AddFollowUpModal
        open={addFollowUpModalOpen}
        onClose={() => setAddFollowUpModalOpen(false)}
        onCreated={() => void loadEncounters(true)}
        popup
      />
    </>
  );
}
