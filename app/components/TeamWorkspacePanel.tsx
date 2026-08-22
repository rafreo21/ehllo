"use client";

import { useEffect, useState } from "react";
import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
import { CreditCard as IdentificationCardIcon } from "react-feather";
import { Plus as PlusIcon } from "react-feather";
import { Users as UsersThreeIcon } from "react-feather";
import { Button } from "./Button";
import { StatusMessage } from "./AsyncState";
import { TextField } from "./FormField";
import type { CardTemplate, WorkspaceSummary } from "../../lib/workspace/types";
import { useToast } from "./ToastContext";

type WorkspacePayload = {
  active?: WorkspaceSummary | null;
  workspaces?: WorkspaceSummary[];
  templates?: CardTemplate[];
  error?: string;
};

export function TeamWorkspacePanel() {
  const { showToast } = useToast();
  const [active, setActive] = useState<WorkspaceSummary | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [teamName, setTeamName] = useState("");
  const [templateCompany, setTemplateCompany] = useState("");
  const [loading, setLoading] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const response = await fetch("/api/workspace");
    if (!response.ok) return;
    const payload = await response.json() as WorkspacePayload;
    setActive(payload.active ?? null);
    setWorkspaces(payload.workspaces ?? []);
    setTemplates(payload.templates ?? []);
  }

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, []);

  async function createTeam() {
    setLoading("team");
    setError("");
    setMessage("");
    const response = await fetch("/api/workspace/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: teamName }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      const message = payload.error || "We couldn’t create that team workspace.";
      setError(message);
      showToast({ tone: "error", message });
      setLoading("");
      return;
    }
    setTeamName("");
    const message = "Team workspace created. Reloading your workspace context…";
    setMessage(message);
    showToast({ tone: "success", message });
    window.setTimeout(() => window.location.reload(), 600);
  }

  async function switchWorkspace(workspaceId: string) {
    setLoading(workspaceId);
    setError("");
    setMessage("");
    const response = await fetch("/api/workspace/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      const message = payload.error || "We couldn’t switch workspaces.";
      setError(message);
      showToast({ tone: "error", message });
      setLoading("");
      return;
    }
    const message = "Workspace switched. Reloading cards and contacts…";
    setMessage(message);
    showToast({ tone: "success", message });
    window.setTimeout(() => window.location.reload(), 600);
  }

  async function createTemplate() {
    setLoading("template");
    setError("");
    setMessage("");
    const response = await fetch("/api/workspace/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: templateCompany }),
    });
    const payload = await response.json() as { error?: string; template?: CardTemplate };
    if (!response.ok) {
      const message = payload.error || "We couldn’t create that template.";
      setError(message);
      showToast({ tone: "error", message });
      setLoading("");
      return;
    }
    setTemplateCompany("");
    const message = "Org card template saved for this workspace.";
    setMessage(message);
    showToast({ tone: "success", message });
    await refresh();
    setLoading("");
  }

  const canManageTemplates = active?.role === "owner" || active?.role === "admin";

  return (
    <section className="activate-panel">
      <header>
        <span className="step-pill">Team workspace</span>
        <h2><UsersThreeIcon size={22} /> Shared workspace and org cards</h2>
        <p>Create a team workspace, switch between personal and team context, and publish card templates members can start from.</p>
      </header>

      <div className="team-workspace-grid">
        <article className="connected-account-card">
          <div>
            <strong>{active?.name || "Current workspace"}</strong>
            <p>{active?.type === "team" ? "Team workspace" : "Personal workspace"} · {active?.role || "member"}</p>
          </div>
          <BuildingsIcon size={22} weight="bold" />
        </article>

        {workspaces.map((workspace) => (
          <article key={workspace.id} className="connected-account-card">
            <div>
              <strong>{workspace.name}</strong>
              <p>{workspace.type === "team" ? "Team" : "Personal"} · {workspace.role}</p>
            </div>
            {workspace.active ? (
              <span className="step-pill">Active</span>
            ) : (
              <Button size="small" variant="secondary" loading={loading === workspace.id} onClick={() => void switchWorkspace(workspace.id)}>
                Switch
              </Button>
            )}
          </article>
        ))}
      </div>

      <div className="team-workspace-actions">
        <TextField label="Team name" value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Northstar Advisory" />
        <Button loading={loading === "team"} onClick={() => void createTeam()}><PlusIcon size={16} />Create team workspace</Button>
      </div>

      {canManageTemplates && active?.type === "team" ? (
        <div className="team-template-panel">
          <header>
            <h3><IdentificationCardIcon size={18} /> Org card templates</h3>
            <p>Members create cards from these defaults so branding stays consistent.</p>
          </header>
          {templates.length ? (
            <ul className="team-template-list">
              {templates.map((template) => (
                <li key={template.id}><strong>{template.name}</strong><span>{template.company || "No company set"}</span></li>
              ))}
            </ul>
          ) : (
            <p className="team-template-empty">No templates yet. Create one to give members a branded starting point.</p>
          )}
          <TextField label="Company name for template" value={templateCompany} onChange={(event) => setTemplateCompany(event.target.value)} placeholder="Northstar Advisory" />
          <Button variant="secondary" loading={loading === "template"} onClick={() => void createTemplate()}><PlusIcon size={16} />Save org template</Button>
        </div>
      ) : null}

      {message ? <StatusMessage tone="success">{message}</StatusMessage> : null}
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
    </section>
  );
}
