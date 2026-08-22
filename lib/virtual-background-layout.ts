type VirtualBackgroundProfile = {
  role: string;
  company: string;
  showCompany?: boolean;
};

/** Side-by-side panel: copy on the left, branded QR on the right (matches original design). */
export const VIRTUAL_BG_PANEL = {
  canvasWidth: 1920,
  canvasHeight: 1080,
  // 1420/440 rather than 1460/360: at the old width the text column came to 174px, and
  // "Raphael Okojie" at 28px bold does not fit - it wrapped onto two lines and pushed the
  // subtitle out of the panel. Same right margin, more room for the part that varies.
  x: 1420,
  y: 72,
  width: 440,
  height: 168,
  pad: 28,
  qrSize: 120,
  nameFontSize: 28,
  subtitleFontSize: 18,
  scanFontSize: 14,
  radius: 20,
} as const;

/**
 * Deliberately removed: the export is not mirrored.
 *
 * This existed to place the panel on the left and flip it, on the reasoning that Meet and
 * Zoom mirror your video. They mirror your *self-view* only - the stream everyone else
 * receives is unmirrored. So flipping it made the panel read backwards for every participant,
 * and left the QR mirrored, which no scanner will read. The code is the entire point of the
 * asset, so that trade was never worth making.
 *
 * The consequence to know: your own preview shows it reversed, the way lettering on a shirt
 * looks in a mirror. Everyone you are talking to sees it the right way round.
 */

export type VirtualBackgroundLayout = {
  subtitle: string;
  nameX: number;
  nameY: number;
  subtitleY: number;
  scanX: number;
  scanY: number;
  qrX: number;
  qrY: number;
  preview: {
    panelWidth: number;
    panelHeight: number;
    pad: number;
    qrSize: number;
    nameFontSize: number;
    subtitleFontSize: number;
    scanFontSize: number;
  };
};

export function buildVirtualBackgroundLayout(
  profile: VirtualBackgroundProfile,
  previewPanelWidth = 240,
): VirtualBackgroundLayout {
  const role = profile.role.trim();
  const company = profile.showCompany !== false ? profile.company.trim() : "";
  const subtitle = [role, company].filter(Boolean).join(" · ");

  const qrX =
    VIRTUAL_BG_PANEL.x + VIRTUAL_BG_PANEL.width - VIRTUAL_BG_PANEL.pad - VIRTUAL_BG_PANEL.qrSize;
  const qrY =
    VIRTUAL_BG_PANEL.y + Math.round((VIRTUAL_BG_PANEL.height - VIRTUAL_BG_PANEL.qrSize) / 2);

  const nameX = VIRTUAL_BG_PANEL.x + VIRTUAL_BG_PANEL.pad;
  const nameY = VIRTUAL_BG_PANEL.y + 46;
  const subtitleY = VIRTUAL_BG_PANEL.y + 80;
  const scanX = nameX;
  const scanY = VIRTUAL_BG_PANEL.y + VIRTUAL_BG_PANEL.height - 22;

  const scale = previewPanelWidth / VIRTUAL_BG_PANEL.width;

  return {
    subtitle,
    nameX,
    nameY,
    subtitleY,
    scanX,
    scanY,
    qrX,
    qrY,
    preview: {
      panelWidth: previewPanelWidth,
      panelHeight: Math.round(VIRTUAL_BG_PANEL.height * scale),
      pad: Math.round(VIRTUAL_BG_PANEL.pad * scale),
      qrSize: Math.max(56, Math.round(VIRTUAL_BG_PANEL.qrSize * scale)),
      nameFontSize: Math.max(12, Math.round(VIRTUAL_BG_PANEL.nameFontSize * scale)),
      subtitleFontSize: Math.max(10, Math.round(VIRTUAL_BG_PANEL.subtitleFontSize * scale)),
      scanFontSize: Math.max(9, Math.round(VIRTUAL_BG_PANEL.scanFontSize * scale)),
    },
  };
}
