import {
  buildVirtualBackgroundJpeg,
  buildVirtualBackgroundSvg,
  buildWatchFacePng,
  buildWatchFaceSvg,
  shareAssetFilename,
  shareAssetMimeType,
  type ShareAssetProfile,
} from "./share-assets";
import { sharpAvailable } from "./sharp-runtime.ts";

export async function renderVirtualBackgroundOrWatchFace(
  type: "virtual-background" | "watch-face",
  profile: ShareAssetProfile,
  slug: string,
  // Only meaningful for virtual backgrounds: pre-mirrors the frame so it reads correctly in
  // your own self-view in Meet, Zoom and Teams. See buildVirtualBackgroundJpeg for the
  // trade-off - participants then see it reversed and cannot scan the QR.
  mirrored = false,
) {
  const mirroredBackground = type === "virtual-background" && mirrored;

  if (!sharpAvailable()) {
    const svg = type === "virtual-background"
      ? await buildVirtualBackgroundSvg(profile, mirroredBackground)
      : await buildWatchFaceSvg(profile);
    return {
      body: new TextEncoder().encode(svg),
      contentType: "image/svg+xml",
      filename: shareAssetFilename(type, slug, "svg", mirroredBackground),
    };
  }

  const asset = type === "virtual-background"
    ? await buildVirtualBackgroundJpeg(profile, mirroredBackground)
    : await buildWatchFacePng(profile);
  const format = type === "virtual-background" ? "jpg" : "png";

  return {
    body: new Uint8Array(asset),
    contentType: shareAssetMimeType(type),
    filename: shareAssetFilename(type, slug, format, mirroredBackground),
  };
}
