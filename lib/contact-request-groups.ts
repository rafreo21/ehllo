/**
 * Contact requests, grouped by the person asking and the detail they asked for.
 *
 * One row per request is the shape the table has and the wrong shape to answer from.
 * Somebody who asks for your Instagram after every meeting produces a request every
 * time, all of them wanting the same answer - and the list was capped at twenty rows,
 * so fifteen asks from one person could bury everybody else. An unreachable request
 * stays pending forever, and the person who asked waits with no explanation.
 *
 * Grouped, that is one thing to answer, the cap counts people rather than asks, and
 * answering once closes every ask in the group. Which is why each group carries every
 * id rather than just the newest.
 *
 * Extracted from the route so the grouping itself is testable without a database.
 */
export type ContactRequestRow = {
  id: string;
  field_type: string;
  created_at: string;
  requester_user_id: string | null;
  workspace_id: string | null;
  follow_up_title?: string | null;
};

export type ContactRequestGroup = {
  key: string;
  workspaceId: string | null;
  fieldType: string;
  /** Every pending ask in the group, newest first. All answered together. */
  ids: string[];
  count: number;
  latestAt: string;
  followUpTitle: string;
};

/** Groups shown at once. Counts people-and-detail pairs, not raw asks. */
export const MAX_REQUEST_GROUPS = 20;

/**
 * Expects rows ordered newest first, which is how the query returns them: the first
 * row seen for a key is the latest, so it supplies the timestamp and the context worth
 * showing. Sorting here instead would mean trusting the caller twice.
 *
 * Requests with no requester_user_id group under one "unknown" key per detail. That is
 * deliberate - they cannot be told apart, and presenting them as separate people would
 * be inventing a distinction the data does not hold.
 */
export function groupContactRequests(rows: ContactRequestRow[]): ContactRequestGroup[] {
  const grouped = new Map<string, ContactRequestGroup>();
  for (const row of rows) {
    const key = `${row.requester_user_id ?? "unknown"}:${row.field_type}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.ids.push(row.id);
      existing.count += 1;
      continue;
    }
    grouped.set(key, {
      key,
      workspaceId: row.workspace_id,
      fieldType: row.field_type,
      ids: [row.id],
      count: 1,
      latestAt: row.created_at,
      followUpTitle: row.follow_up_title?.trim() || "",
    });
  }
  return [...grouped.values()];
}
