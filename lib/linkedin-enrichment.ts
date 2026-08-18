function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function readMetaContent(html: string, key: string) {
  const patterns = [
    new RegExp(`property="${key}"\\s+content="([^"]+)"`, "i"),
    new RegExp(`content="([^"]+)"\\s+property="${key}"`, "i"),
    new RegExp(`name="${key}"\\s+content="([^"]+)"`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

export function isLinkedInAuthWall(html: string) {
  if (/authwall|session_redirect|signin|sign-in|login/i.test(html)) return true;
  const title = readMetaContent(html, "og:title").replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();
  return /^(sign in|log in|join linkedin|linkedin)$/i.test(title);
}

export function linkedInHandleInHtml(html: string, handle: string) {
  const normalized = handle.toLowerCase();
  const ogUrl = readMetaContent(html, "og:url").toLowerCase();
  if (ogUrl.includes(`/in/${normalized}`)) return true;
  const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1]?.toLowerCase() ?? "";
  if (canonical.includes(`/in/${normalized}`)) return true;
  return new RegExp(`linkedin\\.com/in/${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|\\?|"|'|$)`, "i").test(html);
}

export function parseLinkedInOpenGraphTitle(title: string) {
  const cleaned = title.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();
  if (!cleaned || /^(sign in|log in|join linkedin|linkedin)$/i.test(cleaned)) return null;

  const segments = cleaned.split(/\s+[-–-]\s+/);
  const namePart = segments[0]?.trim() ?? cleaned;
  const headline = segments.slice(1).join(" - ").trim();
  const { firstName, lastName } = splitFullName(namePart);

  let role = "";
  let company = "";
  if (headline) {
    const atMatch = headline.match(/^(.+?)\s+at\s+(.+)$/i);
    if (atMatch) {
      role = atMatch[1].trim();
      company = atMatch[2].trim();
    } else {
      const dotParts = headline.split(/\s*[·|@]\s*/).map((part) => part.trim()).filter(Boolean);
      if (dotParts.length >= 2) {
        role = dotParts[0];
        company = dotParts.slice(1).join(" · ");
      } else {
        role = headline;
      }
    }
  }

  return { firstName, lastName, role, company };
}

export function parseLinkedInProfileHtml(html: string, expectedHandle = "") {
  if (isLinkedInAuthWall(html)) return null;
  if (expectedHandle && !linkedInHandleInHtml(html, expectedHandle)) return null;

  const title = readMetaContent(html, "og:title");
  const description = readMetaContent(html, "og:description");
  const parsedTitle = title ? parseLinkedInOpenGraphTitle(title) : null;

  if (!parsedTitle?.firstName && !description) return null;
  if (parsedTitle && !parsedTitle.firstName) return null;

  return {
    firstName: parsedTitle?.firstName ?? "",
    lastName: parsedTitle?.lastName ?? "",
    role: parsedTitle?.role ?? "",
    company: parsedTitle?.company ?? "",
    headline: description || parsedTitle?.role || "",
  };
}
