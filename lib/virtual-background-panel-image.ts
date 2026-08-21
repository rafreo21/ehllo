import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

import { buildBrandedQrPngDataUri } from "./branded-qr.ts";
import { resolveShareQrPayload } from "./contact-qr.ts";
import { loadShareAssetFontBuffers } from "./share-asset-fonts.ts";
import type { ShareAssetProfile } from "./share-assets.ts";
import { VIRTUAL_BG_PANEL } from "./virtual-background-layout.ts";

function profileSubtitle(profile: ShareAssetProfile) {
  const role = profile.role.trim();
  const company = profile.showCompany !== false ? profile.company.trim() : "";
  return [role, company].filter(Boolean).join(" · ");
}

/** Renders the white card panel (text + branded QR) to PNG - matches the in-app preview. */
export async function buildVirtualBackgroundPanelPng(profile: ShareAssetProfile, scale = 2) {
  const width = VIRTUAL_BG_PANEL.width * scale;
  const height = VIRTUAL_BG_PANEL.height * scale;
  const pad = VIRTUAL_BG_PANEL.pad * scale;
  const qrSize = VIRTUAL_BG_PANEL.qrSize * scale;
  const gap = 10 * scale;
  const name = profile.name.trim() || "Your name";
  const subtitle = profileSubtitle(profile);
  const fonts = loadShareAssetFontBuffers();
  // A PNG, not the SVG variant. satori renders <img> by decoding a raster, and hands back
  // an empty box for an SVG data URI - silently, which is why the panel shipped with a blank
  // white square where the code should be. The QR is the only reason this asset exists, so
  // the one thing it must never do is quietly omit it.
  const qrDataUri = await buildBrandedQrPngDataUri(
    resolveShareQrPayload(profile),
    VIRTUAL_BG_PANEL.qrSize * 5 * scale,
  );

  const svg = await satori(
    ({
      type: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          width,
          height,
          backgroundColor: "rgba(255,255,255,0.94)",
          borderRadius: VIRTUAL_BG_PANEL.radius * scale,
          padding: pad,
          gap,
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                flex: 1,
                height: qrSize,
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: { display: "flex", flexDirection: "column", gap: 2 * scale },
                    children: [
                      {
                        type: "div",
                        props: {
                          style: {
                            fontSize: VIRTUAL_BG_PANEL.nameFontSize * scale,
                            fontWeight: 700,
                            color: "#163300",
                            lineHeight: 1.15,
                          },
                          children: name,
                        },
                      },
                      ...(subtitle
                        ? [
                            {
                              type: "div",
                              props: {
                                style: {
                                  fontSize: VIRTUAL_BG_PANEL.subtitleFontSize * scale,
                                  fontWeight: 400,
                                  color: "#667363",
                                  lineHeight: 1.3,
                                },
                                children: subtitle,
                              },
                            },
                          ]
                        : []),
                    ],
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      fontSize: VIRTUAL_BG_PANEL.scanFontSize * scale,
                      fontWeight: 600,
                      color: "#667363",
                    },
                    children: "Scan to save my contact",
                  },
                },
              ],
            },
          },
          {
            type: "img",
            props: {
              src: qrDataUri,
              width: qrSize,
              height: qrSize,
              style: {
                borderRadius: 10 * scale,
                flexShrink: 0,
              },
            },
          },
        ],
      },
      // satori's first parameter is a ReactNode; a hand-built element object is
      // the documented way to call it without JSX.
    } as unknown as Parameters<typeof satori>[0]),
    {
      width,
      height,
      fonts: [
        { name: "Inter", data: fonts.regular, weight: 400, style: "normal" },
        { name: "Inter", data: fonts.bold, weight: 700, style: "normal" },
      ],
    },
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
  });
  return resvg.render().asPng();
}
