import type { Contact } from "../contacts";
import type { Encounter } from "../encounters";

export type CrmSyncPayload = {
  contact: Contact;
  encounters: Encounter[];
};

export function isHubSpotConfigured() {
  return Boolean(process.env.HUBSPOT_ACCESS_TOKEN?.trim());
}

function hubSpotHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function buildHubSpotContactProperties(payload: CrmSyncPayload) {
  const { contact } = payload;
  const properties: Record<string, string> = {
    firstname: contact.firstName,
    lastname: contact.lastName,
    company: contact.company,
    jobtitle: contact.role,
  };
  if (contact.email) properties.email = contact.email;
  if (contact.phone) properties.phone = contact.phone;
  return properties;
}

export function buildHubSpotNoteBody(payload: CrmSyncPayload) {
  const lines = [
    "Ehllo relationship sync",
    "",
    contactSummary(payload.contact),
  ];

  if (payload.encounters.length) {
    lines.push("", "Captured moments:");
    for (const encounter of payload.encounters) {
      lines.push(
        `- ${encounter.title || encounter.personName} (${encounter.startedAt ? new Date(encounter.startedAt).toLocaleDateString() : "unknown date"})`,
      );
      if (encounter.sharedSummary) lines.push(`  Summary: ${encounter.sharedSummary}`);
      if (encounter.privateNotes) lines.push(`  Notes: ${encounter.privateNotes}`);
      const openActions = encounter.actions.filter((action) => action.status !== "completed");
      if (openActions.length) {
        lines.push(`  Open follow-ups: ${openActions.map((action) => action.title).join("; ")}`);
      }
    }
  }

  if (payload.contact.linkedinUrl) {
    lines.push("", `LinkedIn: ${payload.contact.linkedinUrl}`);
  }

  return lines.join("\n");
}

function contactSummary(contact: Contact) {
  const parts = [
    `${contact.firstName} ${contact.lastName}`.trim(),
    [contact.role, contact.company].filter(Boolean).join(" · "),
    contact.email,
    contact.phone,
    contact.context,
  ].filter(Boolean);
  return parts.join("\n");
}

async function hubSpotRequest<T>(path: string, init: RequestInit) {
  const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("HubSpot is not configured.");

  const response = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      ...hubSpotHeaders(token),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(error?.message || "HubSpot request failed.");
  }

  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

async function findHubSpotContactId(email: string) {
  const result = await hubSpotRequest<{ results?: Array<{ id: string }> }>("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{
        filters: [{
          propertyName: "email",
          operator: "EQ",
          value: email,
        }],
      }],
      properties: ["email"],
      limit: 1,
    }),
  });
  return result.results?.[0]?.id ?? null;
}

export async function upsertHubSpotContact(payload: CrmSyncPayload) {
  const properties = buildHubSpotContactProperties(payload);
  let contactId: string | null = null;

  if (payload.contact.email) {
    contactId = await findHubSpotContactId(payload.contact.email);
  }

  if (contactId) {
    await hubSpotRequest(`/crm/v3/objects/contacts/${contactId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
  } else {
    const created = await hubSpotRequest<{ id: string }>("/crm/v3/objects/contacts", {
      method: "POST",
      body: JSON.stringify({ properties }),
    });
    contactId = created.id;
  }

  const noteBody = buildHubSpotNoteBody(payload);
  await hubSpotRequest("/crm/v3/objects/notes", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_note_body: noteBody,
        hs_timestamp: new Date().toISOString(),
      },
      associations: [{
        to: { id: contactId },
        types: [{
          associationCategory: "HUBSPOT_DEFINED",
          associationTypeId: 202,
        }],
      }],
    }),
  });

  return { contactId };
}
