import { deflateSync } from "node:zlib";
import { createWriteStream } from "node:fs";
import path from "node:path";

const BRAND = { r: 0xff, g: 0x3c, b: 0x00 };
const WHITE = { r: 0xff, g: 0xff, b: 0xff };

type RGB = { r: number; g: number; b: number };

class Canvas {
  size: number;
  data: Uint8Array;

  constructor(size: number, background: RGB) {
    this.size = size;
    this.data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) this.setPixelIndex(i, background, 255);
  }

  private setPixelIndex(i: number, color: RGB, alpha: number) {
    this.data[i * 4] = color.r;
    this.data[i * 4 + 1] = color.g;
    this.data[i * 4 + 2] = color.b;
    this.data[i * 4 + 3] = alpha;
  }

  setPixel(x: number, y: number, color: RGB, alpha = 255) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.setPixelIndex(y * this.size + x, color, alpha);
  }

  fillRoundedRect(x0In: number, y0In: number, wIn: number, hIn: number, radius: number, color: RGB) {
    const x0 = Math.round(x0In);
    const y0 = Math.round(y0In);
    const w = Math.round(wIn);
    const h = Math.round(hIn);
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const inCornerZone =
          (x < x0 + radius || x >= x0 + w - radius) &&
          (y < y0 + radius || y >= y0 + h - radius);
        if (inCornerZone) {
          const cx = x < x0 + radius ? x0 + radius : x0 + w - radius;
          const cy = y < y0 + radius ? y0 + radius : y0 + h - radius;
          const dx = x - cx + 0.5;
          const dy = y - cy + 0.5;
          if (dx * dx + dy * dy > radius * radius) continue;
        }
        this.setPixel(x, y, color);
      }
    }
  }

  fillCircle(cx: number, cy: number, radius: number, color: RGB) {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const dx = x - cx + 0.5;
        const dy = y - cy + 0.5;
        if (dx * dx + dy * dy <= radius * radius) this.setPixel(x, y, color);
      }
    }
  }

  toPNG(): Buffer {
    const width = this.size;
    const height = this.size;
    const rowBytes = width * 4;
    const raw = Buffer.alloc((rowBytes + 1) * height);
    for (let y = 0; y < height; y++) {
      raw[y * (rowBytes + 1)] = 0; // filter: none
      raw.set(this.data.subarray(y * rowBytes, y * rowBytes + rowBytes), y * (rowBytes + 1) + 1);
    }
    const idatData = deflateSync(raw);

    const chunks: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type: RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    chunks.push(pngChunk("IHDR", ihdr));
    chunks.push(pngChunk("IDAT", idatData));
    chunks.push(pngChunk("IEND", Buffer.alloc(0)));

    return Buffer.concat(chunks);
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function drawBusIcon(size: number, safeMargin: number) {
  const canvas = new Canvas(size, BRAND);
  const inner = size - safeMargin * 2;

  const bodyW = inner * 0.62;
  const bodyH = inner * 0.34;
  const bodyX = safeMargin + (inner - bodyW) / 2;
  const bodyY = safeMargin + inner * 0.28;
  canvas.fillRoundedRect(bodyX, bodyY, bodyW, bodyH, bodyH * 0.28, WHITE);

  // windshield strip (brand-colored gap near the top of the body)
  const stripH = bodyH * 0.16;
  canvas.fillRoundedRect(bodyX + bodyW * 0.06, bodyY + bodyH * 0.14, bodyW * 0.88, stripH, stripH * 0.4, BRAND);

  const wheelR = bodyH * 0.26;
  const wheelY = bodyY + bodyH + wheelR * 0.15;
  canvas.fillCircle(bodyX + bodyW * 0.24, wheelY, wheelR, WHITE);
  canvas.fillCircle(bodyX + bodyW * 0.76, wheelY, wheelR, WHITE);

  return canvas;
}

function writeIcon(canvas: Canvas, filePath: string) {
  const png = canvas.toPNG();
  const stream = createWriteStream(filePath);
  stream.write(png);
  stream.end();
  console.log(`Wrote ${filePath} (${png.length} bytes)`);
}

const outDir = path.resolve(import.meta.dirname, "..", "..", "artifacts", "utb-ticketing", "public", "icons");

writeIcon(drawBusIcon(192, 192 * 0.12), path.join(outDir, "icon-192.png"));
writeIcon(drawBusIcon(512, 512 * 0.12), path.join(outDir, "icon-512.png"));
// Maskable: keep content inside the ~80% safe zone (larger margin) so OS masks don't clip it.
writeIcon(drawBusIcon(512, 512 * 0.2), path.join(outDir, "icon-512-maskable.png"));
