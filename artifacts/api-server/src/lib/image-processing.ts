import path from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import sharp from "sharp";

/**
 * Image pipeline for uploads (hotels, tourism spots, vehicles): EXIF orientation applied, resized,
 * converted to WebP without metadata, plus a thumbnail. The original upload is never written to disk
 * (multer keeps it in memory).
 */
export const MAX_SIDE = 1600;       // main image: longest side, never enlarged
export const MAIN_QUALITY = 80;
export const THUMB_WIDTH = 400;     // thumbnail: max width, never enlarged
export const THUMB_QUALITY = 75;
/** Refuses "decompression bombs": tiny files that decode to huge pixel buffers. 40 MP ≈ 7300×5500. */
export const MAX_INPUT_PIXELS = 40_000_000;
/** At most this many images processed at once; other uploads wait their turn (small VPS). */
export const MAX_PARALLEL_JOBS = 2;

// libvips threads per image: 1 keeps CPU use predictable on a small VPS (jobs are also capped above).
sharp.concurrency(1);
// Every upload is a different image: the libvips operation cache would only hold memory for nothing.
sharp.cache(false);

export class ImageRejected extends Error {
  constructor(message: string, readonly status: 400 | 415) {
    super(message);
  }
}

// Tiny semaphore so a burst of uploads doesn't run many sharp jobs at the same time
let running = 0;
const waiting: Array<() => void> = [];
async function withSlot<T>(job: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL_JOBS) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await job();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Main image and thumbnail as WebP buffers. Throws ImageRejected for images we refuse or can't decode. */
async function renderImages(input: Buffer): Promise<{ main: Buffer; thumb: Buffer }> {
  try {
    // rotate() with no argument applies the EXIF orientation; metadata is dropped on output (sharp's default)
    const main = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: MAIN_QUALITY }) // keeps the alpha channel of transparent PNGs
      .toBuffer();
    // From the already rotated and reduced image: faster, and same orientation
    const thumb = await sharp(main)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
    return { main, thumb };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/pixel limit/i.test(message)) {
      throw new ImageRejected(`Image trop grande : ses dimensions dépassent ${MAX_INPUT_PIXELS / 1_000_000} mégapixels`, 400);
    }
    // Header looked fine (checked before) but the content can't be decoded: truncated, corrupted…
    throw new ImageRejected("L'image est illisible ou corrompue", 415);
  }
}

/**
 * Processes an upload and writes `<id>.webp` + `<id>-thumb.webp` into `dir`.
 * On any failure nothing is left behind: partially written files are removed.
 */
export async function processAndStoreImage(input: Buffer, dir: string, id: string): Promise<string> {
  const { main, thumb } = await withSlot(() => renderImages(input));

  const mainName = `${id}.webp`;
  const written: string[] = [];
  try {
    for (const [name, data] of [[mainName, main], [`${id}-thumb.webp`, thumb]] as const) {
      const filePath = path.join(dir, name);
      await writeFile(filePath, data, { flag: "wx" });
      written.push(filePath);
    }
  } catch (err) {
    await Promise.all(written.map((p) => unlink(p).catch(() => {})));
    throw err;
  }
  return mainName;
}
