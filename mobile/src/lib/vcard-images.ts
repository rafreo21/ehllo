/** vCard image fields shared with the web export helpers. */

export type VcardEmbeddedImage = {
  base64: string;
  mimeType: string;
};

export type VcardImageFields = {
  profilePhoto?: VcardEmbeddedImage | null;
  companyLogoPhoto?: VcardEmbeddedImage | null;
  profilePhotoUrl?: string | null;
  companyLogoUrl?: string | null;
  coverPhotoUrl?: string | null;
  showCompanyDetails?: boolean;
};

function escapeVcard(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function vcardImageType(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("png")) return "PNG";
  if (normalized.includes("gif")) return "GIF";
  if (normalized.includes("webp")) return "WEBP";
  return "JPEG";
}

export function foldVcardLine(line: string) {
  const maxLength = 75;
  if (line.length <= maxLength) return line;
  const chunks = [line.slice(0, maxLength)];
  let index = maxLength;
  while (index < line.length) {
    chunks.push(` ${line.slice(index, index + maxLength - 1)}`);
    index += maxLength - 1;
  }
  return chunks.join("\r\n");
}

function appendEmbeddedImage(lines: string[], property: string, image: VcardEmbeddedImage) {
  const type = vcardImageType(image.mimeType);
  // RFC 2426 defines only "b" (RFC 2047 shorthand) as a valid ENCODING value for
  // vCard 3.0 - "ENCODING=BASE64" is not spec-valid syntax at all, which is why it
  // silently failed to decode on iOS Contacts.
  lines.push(foldVcardLine(`${property};ENCODING=b;TYPE=${type}:${image.base64}`));
}

function appendImageUri(lines: string[], property: string, url: string) {
  lines.push(foldVcardLine(`${property};VALUE=URI:${escapeVcard(url.trim())}`));
}

export function appendVcardImages(lines: string[], input: VcardImageFields) {
  if (input.profilePhoto) {
    appendEmbeddedImage(lines, "PHOTO", input.profilePhoto);
  } else if (input.profilePhotoUrl?.trim()) {
    appendImageUri(lines, "PHOTO", input.profilePhotoUrl);
  }

  if (input.showCompanyDetails ?? true) {
    if (input.companyLogoPhoto) {
      appendEmbeddedImage(lines, "LOGO", input.companyLogoPhoto);
    } else if (input.companyLogoUrl?.trim()) {
      appendImageUri(lines, "LOGO", input.companyLogoUrl);
    }
  }
}
