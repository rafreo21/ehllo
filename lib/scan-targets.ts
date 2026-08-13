export type ScanTarget =
  | { type: "aftermeet_card"; slug: string; url: string }
  | { type: "linkedin"; url: string; handle: string }
  | { type: "vcard"; text: string }
  | { type: "email"; email: string }
  | { type: "phone"; phone: string }
  | { type: "url"; url: string }
  | { type: "text"; text: string };

function normalizeScanInput(raw: string) {
  return raw.replace(/^\uFEFF/, "").trim();
}

export function parseEhlloCardSlug(value: string) {
  try {
    const url = new URL(value, "https://aftermeet.local");
    const match = url.pathname.match(/^\/c\/([^/]+)\/?$/i);
    if (!match) return null;
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return null;
  }
}

export function parseScanTarget(raw: string): ScanTarget {
  const value = normalizeScanInput(raw);
  if (!value) return { type: "text", text: "" };

  const slug = parseEhlloCardSlug(value);
  if (slug) return { type: "aftermeet_card", slug, url: value };

  const linkedInMatch = value.match(/(?:https?:\/\/)?(?:[a-z]+\.)?linkedin\.com\/in\/([a-zA-Z0-9\-_%]+)/i);
  if (linkedInMatch) {
    const handle = decodeURIComponent(linkedInMatch[1]).replace(/\/+$/, "");
    return {
      type: "linkedin",
      handle,
      url: /^https?:\/\//i.test(value) ? value : `https://www.linkedin.com/in/${handle}`,
    };
  }

  if (/^BEGIN:VCARD/i.test(value)) return { type: "vcard", text: value };

  if (/^mailto:/i.test(value)) {
    return { type: "email", email: value.replace(/^mailto:/i, "").split("?")[0] };
  }

  if (/^tel:/i.test(value)) {
    return { type: "phone", phone: value.replace(/^tel:/i, "").trim() };
  }

  if (/^https?:\/\//i.test(value)) return { type: "url", url: value };

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { type: "email", email: value };

  return { type: "text", text: value };
}
