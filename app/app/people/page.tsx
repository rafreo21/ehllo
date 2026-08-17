"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search as MagnifyingGlassIcon } from "react-feather";
import { Edit2 as PencilSimpleLineIcon } from "react-feather";
import { Plus as PlusIcon } from "react-feather";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { SortAscendingIcon } from "@phosphor-icons/react/dist/csr/SortAscending";
import { Users as UsersThreeIcon } from "react-feather";
import { X as XIcon } from "react-feather";
import { PageSkeleton, StatusMessage } from "../../components/AsyncState";
import { Button, LinkButton } from "../../components/Button";
import { ConnectionDrawer } from "../../components/ConnectionDrawer";
import { TextField } from "../../components/FormField";
import { useToast } from "../../components/ToastContext";
import {
  connectionAvatarUrl,
  connectionSourceLabel,
  createManualContact,
  deleteConnection,
  enrichConnectionPhotos,
  fetchAllConnectionsMerged,
  filterConnections,
  formatConnectionDate,
  sortConnections,
  type ConnectionItem,
  type ConnectionSort,
} from "../../../lib/connections";

const CONNECTIONS_PAGE_SIZE = 10;

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ConnectionSort>("date");
  const [addOpen, setAddOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [manual, setManual] = useState({ name: "", email: "", role: "", company: "" });
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeConnection, setActiveConnection] = useState<ConnectionItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { showToast } = useToast();

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError("");
    try {
      const merged = await fetchAllConnectionsMerged();
      setConnections(merged);
      setLoading(false);
      setEnriching(true);
      void enrichConnectionPhotos(merged)
        .then(setConnections)
        .finally(() => setEnriching(false));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load connections.");
      setConnections([]);
      setLoading(false);
      setEnriching(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState !== "hidden") void load(true);
    }
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(interval);
    };
  }, [load]);

  const visibleConnections = useMemo(
    () => sortConnections(filterConnections(connections, query), sort),
    [connections, query, sort],
  );
  const totalPages = Math.max(1, Math.ceil(visibleConnections.length / CONNECTIONS_PAGE_SIZE));
  const pagedConnections = useMemo(
    () => visibleConnections.slice((page - 1) * CONNECTIONS_PAGE_SIZE, page * CONNECTIONS_PAGE_SIZE),
    [visibleConnections, page],
  );
  useEffect(() => { setPage(1); }, [query, sort]);
  useEffect(() => { setPage((current) => Math.min(current, totalPages)); }, [totalPages]);
  useEffect(() => { setSelectedIds(new Set()); }, [page, query, sort]);

  const pageAllSelected = pagedConnections.length > 0 && pagedConnections.every((connection) => selectedIds.has(connection.id));

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((current) => {
      if (pageAllSelected) {
        const next = new Set(current);
        for (const connection of pagedConnections) next.delete(connection.id);
        return next;
      }
      const next = new Set(current);
      for (const connection of pagedConnections) next.add(connection.id);
      return next;
    });
  }

  async function deleteSelected() {
    const targets = connections.filter((connection) => selectedIds.has(connection.id));
    if (!targets.length) return;
    const label = targets.length === 1 ? targets[0].name : `these ${targets.length} connections`;
    if (!window.confirm(`Are you sure you want to delete ${label}? You can always reconnect or add them again later.`)) return;
    setDeleting(true);
    setError("");
    try {
      await Promise.all(targets.map((connection) => deleteConnection(connection)));
      setSelectedIds(new Set());
      setSuccess(`${targets.length} connection${targets.length === 1 ? "" : "s"} removed.`);
      showToast({ tone: "success", message: `${targets.length} connection${targets.length === 1 ? "" : "s"} removed.` });
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not remove the selected connections.";
      setError(message);
      showToast({ tone: "error", message });
    } finally {
      setDeleting(false);
    }
  }


  async function saveManual() {
    setSavingManual(true);
    setError("");
    try {
      await createManualContact(manual);
      setManualOpen(false);
      setAddOpen(false);
      setManual({ name: "", email: "", role: "", company: "" });
      setSuccess(`${manual.name.trim()} was added to your connections.`);
      showToast({ tone: "success", message: `${manual.name.trim()} was added to your connections.` });
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not save this connection.";
      setError(message);
      showToast({ tone: "error", message });
    } finally {
      setSavingManual(false);
    }
  }

  const hasConnections = connections.length > 0;

  return (
    <>
      <div className="flow-page connections-page">
        <div className="flow-heading">
          <div>
            <h1>People you’ve met</h1>
            <p>Cards you saved and people who shared their details with you.</p>
          </div>
          <div className="flow-heading-actions">
            <Button size="small" onClick={() => setAddOpen(true)} aria-label="Add connection">
              <PlusIcon size={15} /> Add connection
            </Button>
          </div>
        </div>

        {success ? (
          <StatusMessage tone="success" action={<Button size="small" variant="ghost" onClick={() => setSuccess("")}>Dismiss</Button>}>
            {success}
          </StatusMessage>
        ) : null}
        {error ? (
          <StatusMessage tone="error" action={<Button size="small" variant="ghost" onClick={() => setError("")}>Dismiss</Button>}>
            {error}
          </StatusMessage>
        ) : null}

        {loading ? (
          <PageSkeleton rows={5} />
        ) : hasConnections ? (
          <div className="data-table-shell connections-table-shell">
            <div className="table-toolbar">
              {selectedIds.size ? (
                <div className="table-bulk-actions">
                  <span className="followup-count-caption">{selectedIds.size} selected</span>
                  <Button size="small" variant="secondary" disabled={deleting} onClick={() => void deleteSelected()}>
                    {deleting ? "Removing…" : "Delete selected"}
                  </Button>
                  <Button size="small" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                </div>
              ) : (
                <label className="connections-search">
                  <MagnifyingGlassIcon size={18} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search connections"
                  />
                </label>
              )}
              <Button size="small" variant="secondary" className="table-toolbar-sort" onClick={() => setSortOpen(true)} aria-label="Sort connections">
                <SortAscendingIcon size={16} weight="bold" />
                {sort === "date" ? "Last added" : "A–Z"}
              </Button>
            </div>
            {enriching ? <p className="connections-enriching">Updating photos…</p> : null}
            {visibleConnections.length ? (
              <table className="data-table connections-table">
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
                    <th scope="col">Person</th>
                    <th scope="col">Source</th>
                    <th scope="col">Added</th>
                    <th scope="col"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedConnections.map((connection) => (
                    <tr key={connection.id}>
                      <td className="table-checkbox-cell">
                        <input
                          type="checkbox"
                          aria-label={`Select ${connection.name}`}
                          checked={selectedIds.has(connection.id)}
                          onChange={() => toggleSelected(connection.id)}
                        />
                      </td>
                      <td data-label="Person">
                        <button type="button" className="table-person" onClick={() => setActiveConnection(connection)}>
                          <img
                            className="connections-avatar"
                            src={connection.photoUrl || connectionAvatarUrl(connection)}
                            alt=""
                          />
                          <span>
                            <strong>{connection.name}</strong>
                            <small>{connection.subtitle}</small>
                          </span>
                        </button>
                      </td>
                      <td data-label="Source"><span className="table-chip">{connectionSourceLabel(connection.source)}</span></td>
                      <td data-label="Added">{connection.connectedAt ? formatConnectionDate(connection.connectedAt) : "N/A"}</td>
                      <td className="table-open-cell">
                        <Button size="small" variant="secondary" onClick={() => setActiveConnection(connection)} aria-label={`Open ${connection.name}`}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {!visibleConnections.length ? (
              <div className="connections-empty-search">
                <span className="connections-empty-search-icon"><MagnifyingGlassIcon size={20} /></span>
                <strong>No connections match your search</strong>
                <span>Try a different name, or clear your search and sort.</span>
              </div>
            ) : null}
            {totalPages > 1 ? (
              <nav className="table-pagination" aria-label="Connections pagination">
                <span className="table-pagination-summary">
                  Showing {(page - 1) * CONNECTIONS_PAGE_SIZE + 1}–{Math.min(page * CONNECTIONS_PAGE_SIZE, visibleConnections.length)} of {visibleConnections.length}
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
        ) : (
          <button type="button" className="connections-empty-prompt" onClick={() => setAddOpen(true)}>
            <span className="empty-icon"><UsersThreeIcon size={22} /></span>
            <strong>No connections yet</strong>
            <span>Scan a card or add someone manually.</span>
          </button>
        )}
      </div>

      {addOpen ? (
        <div className="connections-modal-backdrop add-followup-modal-backdrop" role="presentation" onClick={() => setAddOpen(false)}>
          <div className="connections-modal" role="dialog" aria-label="Add connection" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Add connection</h2>
              <button type="button" aria-label="Close" onClick={() => setAddOpen(false)}><XIcon size={18} /></button>
            </header>
            <p>Add someone you met by scanning their card or entering their details manually.</p>
            <div className="connections-add-options">
              <LinkButton href="/app/scan" onClick={() => setAddOpen(false)}>
                <QrCodeIcon size={18} weight="bold" /> Scan QR code
              </LinkButton>
              <Button
                variant="secondary"
                onClick={() => {
                  setAddOpen(false);
                  setManualOpen(true);
                }}
              >
                <PencilSimpleLineIcon size={18} /> Add manually
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {manualOpen ? (
        <div className="connections-modal-backdrop" role="presentation" onClick={() => setManualOpen(false)}>
          <div className="connections-modal" role="dialog" aria-label="Add manually" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Add manually</h2>
              <button type="button" aria-label="Close" onClick={() => setManualOpen(false)}><XIcon size={18} /></button>
            </header>
            <form
              className="connections-manual-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveManual();
              }}
            >
              <TextField label="Name" value={manual.name} onChange={(event) => setManual((prev) => ({ ...prev, name: event.target.value }))} required />
              <TextField label="Email" type="email" value={manual.email} onChange={(event) => setManual((prev) => ({ ...prev, email: event.target.value }))} />
              <TextField label="Role" value={manual.role} onChange={(event) => setManual((prev) => ({ ...prev, role: event.target.value }))} />
              <TextField label="Company" value={manual.company} onChange={(event) => setManual((prev) => ({ ...prev, company: event.target.value }))} />
              <div className="form-actions">
                <Button type="button" variant="ghost" onClick={() => setManualOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={savingManual || !manual.name.trim()}>
                  {savingManual ? "Saving…" : "Save connection"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {sortOpen ? (
        <div className="connections-modal-backdrop" role="presentation" onClick={() => setSortOpen(false)}>
          <div className="connections-modal connections-modal-compact" role="dialog" aria-label="Sort by" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Sort by</h2>
              <button type="button" aria-label="Close" onClick={() => setSortOpen(false)}><XIcon size={18} /></button>
            </header>
            <div className="connections-add-options">
              <Button
                variant={sort === "date" ? "primary" : "secondary"}
                onClick={() => {
                  setSort("date");
                  setSortOpen(false);
                }}
              >
                Last added
              </Button>
              <Button
                variant={sort === "az" ? "primary" : "secondary"}
                onClick={() => {
                  setSort("az");
                  setSortOpen(false);
                }}
              >
                A–Z
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConnectionDrawer
        connection={activeConnection}
        onClose={() => setActiveConnection(null)}
        onRemoved={() => {
          setActiveConnection(null);
          void load();
        }}
      />
    </>
  );
}
