import { readFileSync } from "node:fs";
import { join } from "node:path";

function readEhlloLogoBase64() {
  const candidates = [
    join(process.cwd(), "public", "ehllo-mark.png"),
    join(process.cwd(), "..", "public", "ehllo-mark.png"),
    join(process.cwd(), "site", "public", "ehllo-mark.png"),
    join(process.cwd(), "aftermeet", "site", "public", "ehllo-mark.png"),
  ];

  for (const candidate of candidates) {
    try {
      const buffer = readFileSync(candidate);
      if (buffer.length > 0) return buffer.toString("base64");
    } catch {
      continue;
    }
  }

  return "";
}

export const EHLLO_LOGO_PNG_BASE64 = readEhlloLogoBase64();
