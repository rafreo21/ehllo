const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const QRCode = require('qrcode');

const COLORS = {
  bg: [20, 24, 20, 255],
  accent: [159, 232, 112, 255],
  white: [255, 255, 255, 255],
  qrDark: [22, 51, 0, 255],
  text: [255, 255, 255, 255],
  muted: [184, 196, 179, 255],
  subtle: [143, 160, 136, 255],
  panel: [0, 0, 0, 255],
  avatar: [36, 48, 36, 255],
};

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createCanvas(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  return {
    width,
    height,
    pixels,
    set(x, y, color) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const offset = (y * width + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3];
    },
    fill(color) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) this.set(x, y, color);
      }
    },
    fillRect(x, y, w, h, color) {
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) this.set(px, py, color);
      }
    },
    fillRoundRect(x, y, w, h, radius, color) {
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          const cx = px < x + radius ? x + radius : px > x + w - radius - 1 ? x + w - radius - 1 : px;
          const cy = py < y + radius ? y + radius : py > y + h - radius - 1 ? y + h - radius - 1 : py;
          const dx = px - cx;
          const dy = py - cy;
          if (px < x + radius || px >= x + w - radius || py < y + radius || py >= y + h - radius || dx * dx + dy * dy <= radius * radius) {
            this.set(px, py, color);
          }
        }
      }
    },
    strokeRoundRect(x, y, w, h, radius, stroke, color) {
      for (let t = 0; t < stroke; t++) {
        this.fillRoundRect(x + t, y + t, w - t * 2, h - t * 2, Math.max(radius - t, 0), color);
      }
      this.fillRoundRect(x + stroke, y + stroke, w - stroke * 2, h - stroke * 2, Math.max(radius - stroke, 0), COLORS.bg);
    },
    toPng() {
      const raw = Buffer.alloc((width * 4 + 1) * height);
      for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0;
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          const row = y * (width * 4 + 1) + 1 + x * 4;
          raw[row] = pixels[offset];
          raw[row + 1] = pixels[offset + 1];
          raw[row + 2] = pixels[offset + 2];
          raw[row + 3] = pixels[offset + 3];
        }
      }
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(width, 0);
      ihdr.writeUInt32BE(height, 4);
      ihdr[8] = 8;
      ihdr[9] = 6;
      const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      return Buffer.concat([
        signature,
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
      ]);
    },
  };
}

function qrMatrix(text) {
  return QRCode.create(text, { errorCorrectionLevel: 'H' }).modules;
}

function drawQr(canvas, x, y, size, matrix, options = {}) {
  const count = matrix.size;
  const cell = size / count;
  const light = options.light || COLORS.white;
  const dark = options.dark || COLORS.qrDark;
  canvas.fillRect(x, y, size, size, light);
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (matrix.get(row, col)) {
        const px = Math.round(x + col * cell);
        const py = Math.round(y + row * cell);
        const pw = Math.max(1, Math.round(x + (col + 1) * cell) - px);
        const ph = Math.max(1, Math.round(y + (row + 1) * cell) - py);
        canvas.fillRect(px, py, pw, ph, dark);
      }
    }
  }
  if (options.logoSize) {
    const logo = options.logoSize;
    const lx = x + Math.round((size - logo) / 2);
    const ly = y + Math.round((size - logo) / 2);
    canvas.fillRoundRect(lx, ly, logo, logo, Math.round(logo * 0.22), COLORS.white);
    canvas.fillRoundRect(lx + 3, ly + 3, logo - 6, logo - 6, Math.round(logo * 0.18), COLORS.accent);
  }
}

function drawQrScanPreview() {
  const scale = 4;
  const size = 110 * scale;
  const canvas = createCanvas(size, size);
  canvas.fill(COLORS.bg);
  const inset = 8 * scale;
  const frame = size - inset * 2;
  canvas.fillRoundRect(inset, inset, frame, frame, 18 * scale, COLORS.white);
  canvas.strokeRoundRect(inset, inset, frame, frame, 18 * scale, 3 * scale, COLORS.accent);
  const qrInset = inset + 10 * scale;
  const qrSize = frame - 20 * scale;
  drawQr(canvas, qrInset, qrInset, qrSize, qrMatrix('https://ehllo.io/c/demo'), { logoSize: 22 * scale });
  return canvas.toPng();
}

function drawBusinessCardPreview() {
  const scale = 4;
  const width = 250 * scale;
  const height = 110 * scale;
  const canvas = createCanvas(width, height);
  canvas.fill(COLORS.bg);
  canvas.fillRoundRect(0, 0, width, height, 20 * scale, COLORS.bg);

  const qrBox = 72 * scale;
  const qrX = 12 * scale;
  const qrY = Math.round((height - qrBox) / 2);
  canvas.fillRoundRect(qrX, qrY, qrBox, qrBox, 12 * scale, COLORS.panel);
  drawQr(canvas, qrX + 6 * scale, qrY + 6 * scale, qrBox - 12 * scale, qrMatrix('https://ehllo.io/c/demo'), { logoSize: 16 * scale });

  const textX = qrX + qrBox + 12 * scale;
  canvas.fillRoundRect(textX, 18 * scale, 28 * scale, 28 * scale, 14 * scale, COLORS.avatar);
  canvas.fillRect(textX + 9 * scale, 24 * scale, 10 * scale, 3 * scale, COLORS.accent);
  canvas.fillRect(textX + 12 * scale, 21 * scale, 3 * scale, 10 * scale, COLORS.accent);

  canvas.fillRect(textX, 54 * scale, 120 * scale, 10 * scale, COLORS.text);
  canvas.fillRect(textX, 70 * scale, 96 * scale, 7 * scale, COLORS.muted);
  canvas.fillRect(textX, 84 * scale, 72 * scale, 6 * scale, COLORS.subtle);
  canvas.fillRect(textX, 98 * scale, 56 * scale, 5 * scale, COLORS.accent);

  const pagerX = width - 72 * scale;
  canvas.fillRect(pagerX, height - 18 * scale, 36 * scale, 5 * scale, COLORS.subtle);
  canvas.fillRect(width - 34 * scale, height - 24 * scale, 10 * scale, 10 * scale, COLORS.text);
  canvas.fillRect(width - 18 * scale, height - 24 * scale, 10 * scale, 10 * scale, COLORS.text);

  return canvas.toPng();
}

function drawConnectionsPreview() {
  const scale = 4;
  const width = 250 * scale;
  const height = 110 * scale;
  const canvas = createCanvas(width, height);
  canvas.fill(COLORS.bg);
  canvas.fillRoundRect(0, 0, width, height, 20 * scale, COLORS.bg);
  canvas.fillRect(12 * scale, 14 * scale, 120 * scale, 6 * scale, COLORS.accent);

  const rows = [
    { initial: 'J', nameWidth: 88, subWidth: 112 },
    { initial: 'C', nameWidth: 112, subWidth: 96 },
  ];

  rows.forEach((row, index) => {
    const y = 30 * scale + index * 34 * scale;
    canvas.fillRoundRect(12 * scale, y, 24 * scale, 24 * scale, 12 * scale, COLORS.avatar);
    canvas.fillRect(20 * scale, y + 8 * scale, 8 * scale, 8 * scale, COLORS.text);
    canvas.fillRect(44 * scale, y + 4 * scale, row.nameWidth, 8 * scale, COLORS.text);
    canvas.fillRect(44 * scale, y + 16 * scale, row.subWidth, 6 * scale, COLORS.subtle);
    canvas.fillRoundRect(width - 68 * scale, y, 24 * scale, 24 * scale, 12 * scale, COLORS.avatar);
    canvas.fillRoundRect(width - 36 * scale, y, 24 * scale, 24 * scale, 12 * scale, COLORS.avatar);
  });

  return canvas.toPng();
}

function writeWidgetPreviewPngs(drawableDir) {
  fs.mkdirSync(drawableDir, { recursive: true });
  fs.writeFileSync(path.join(drawableDir, 'aftermeet_widget_preview_qr_scan.png'), drawQrScanPreview());
  fs.writeFileSync(path.join(drawableDir, 'aftermeet_widget_preview_business_card.png'), drawBusinessCardPreview());
  fs.writeFileSync(path.join(drawableDir, 'aftermeet_widget_preview_connections.png'), drawConnectionsPreview());
}

module.exports = { writeWidgetPreviewPngs };
