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
) {
  if (!sharpAvailable()) {
    const svg = type === "virtual-background"
      ? await buildVirtualBackgroundSvg(profile)
      : await buildWatchFaceSvg(profile);
    return {
      body: new TextEncoder().encode(svg),
      contentType: "image/svg+xml",
      filename: shareAssetFilename(type, slug, "svg"),
    };
  }

  const asset = type === "virtual-background"
    ? await buildVirtualBackgroundJpeg(profile)
    : await buildWatchFacePng(profile);
  const format = type === "virtual-background" ? "jpg" : "png";

  return {
    body: new Uint8Array(asset),
    contentType: shareAssetMimeType(type),
    filename: shareAssetFilename(type, slug, format),
  };
}
