import { Router, type IRouter, type Request, type Response } from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { requireRole } from "../middlewares/require-role";
import { UPLOADS_DIR, UPLOADS_URL_PREFIX } from "../lib/uploads";
import { processAndStoreImage, ImageRejected } from "../lib/image-processing";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

class UploadRejected extends Error {}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  // First pass on what the client claims (extension + mimetype); the real content is checked after
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new UploadRejected("Format non accepté : seules les images JPG, PNG et WEBP sont autorisées"));
      return;
    }
    cb(null, true);
  },
});

/** Runs multer and turns its errors into clean 4xx responses. Resolves false if a response was already sent. */
function receiveFile(req: Request, res: Response): Promise<boolean> {
  return new Promise((resolve) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (!err) { resolve(true); return; }
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Fichier trop volumineux (5 Mo maximum)" });
      } else if (err instanceof multer.MulterError) {
        res.status(400).json({ error: `Envoi invalide : un seul fichier, dans le champ "file" (${err.code})` });
      } else if (err instanceof UploadRejected) {
        res.status(415).json({ error: err.message });
      } else {
        res.status(400).json({ error: "Envoi du fichier impossible" });
      }
      resolve(false);
    });
  });
}

const router: IRouter = Router();

// Multipart body: the generated UploadImageBody (zod.instanceof(File)) doesn't apply to multer's
// req.file, so validation is done by hand below — declared type first, then the real content.
router.post("/admin/uploads", requireRole("admin"), async (req, res): Promise<void> => {
  if (!(await receiveFile(req, res))) return;

  const file = req.file;
  if (!file) { res.status(400).json({ error: 'Aucun fichier reçu (champ "file")' }); return; }

  // The extension and mimetype come from the client: check the actual bytes too,
  // so e.g. a PDF renamed to .jpg is refused.
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime) || detected.mime !== file.mimetype) {
    res.status(415).json({ error: "Le contenu du fichier n'est pas une image JPG, PNG ou WEBP valide" });
    return;
  }

  // Compressed WebP + thumbnail; the original is never written to disk.
  // Server-generated name: nothing from the original filename ends up on disk.
  let filename: string;
  try {
    filename = await processAndStoreImage(file.buffer, UPLOADS_DIR, randomUUID());
  } catch (err) {
    if (err instanceof ImageRejected) { res.status(err.status).json({ error: err.message }); return; }
    // Disk full, permissions…: no internal detail in the response, but logged for the admin
    req.log.error({ err }, "Image upload could not be stored");
    res.status(500).json({ error: "Impossible d'enregistrer l'image, réessayez plus tard" });
    return;
  }

  res.status(201).json({ url: `${UPLOADS_URL_PREFIX}/${filename}` });
});

export default router;
