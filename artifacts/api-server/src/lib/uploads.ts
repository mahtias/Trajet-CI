import path from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Where uploaded images live on disk.
 *
 * The server always runs from the esbuild bundle (dist/index.mjs), so by default this is
 * artifacts/api-server/uploads — next to dist/, which build.mjs wipes on every build, and
 * git-ignored so the VPS `git reset --hard` deploy leaves it alone.
 * Set UPLOADS_DIR to store them elsewhere (e.g. a dedicated volume).
 */
const bundleDir = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(bundleDir, "..", "uploads");

/** Public URL prefix. Under /api so it goes through the same proxy as the API (Vite dev proxy, Nginx). */
export const UPLOADS_URL_PREFIX = "/api/uploads";

mkdirSync(UPLOADS_DIR, { recursive: true });
