import { NextResponse } from "next/server";

import { getAppUser } from "../../../lib/auth/context";
import { createClient } from "../../../lib/supabase/server";
import {
  canManageTemplates,
  cardTemplateFromRow,
  type CardTemplateRow,
  workspaceSummaryFromRow,
  type WorkspaceRow,
} from "../../../lib/workspace/server";

export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

  if (user.id === "local-development-preview") {
    const active = {
      id: user.workspaceId,
      name: user.workspaceName,
      type: user.workspaceType,
      role: user.workspaceRole,
      active: true,
    };
    return NextResponse.json({
      active,
      workspaces: [active],
      templates: [],
      preview: true,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createClient();
  const { data: memberships, error } = await supabase
    .from("workspace_memberships")
    .select("role, workspace:workspaces(id, name, type)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: "We couldn’t load your workspaces." }, { status: 500 });
  }

  const workspaces = (memberships ?? [])
    .map((membership) => {
      const embedded = membership.workspace as unknown;
      const workspace = (Array.isArray(embedded) ? embedded[0] : embedded) as
        | { id: string; name: string; type: "personal" | "team" }
        | null
        | undefined;
      if (!workspace) return null;
      return workspaceSummaryFromRow({
        id: workspace.id,
        name: workspace.name,
        type: workspace.type,
        role: membership.role as WorkspaceRow["role"],
      }, user.workspaceId);
    })
    .filter(Boolean);

  const active = workspaces.find((workspace) => workspace?.active) ?? workspaces[0] ?? null;

  let templates: ReturnType<typeof cardTemplateFromRow>[] = [];
  if (active && canManageTemplates(active.role)) {
    const { data } = await supabase
      .from("card_templates")
      .select("*")
      .eq("workspace_id", user.workspaceId)
      .order("updated_at", { ascending: false });
    templates = ((data ?? []) as CardTemplateRow[]).map(cardTemplateFromRow);
  }

  return NextResponse.json({
    active,
    workspaces,
    templates,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
