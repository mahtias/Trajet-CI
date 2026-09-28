/**
 * Uploads processed by the server are stored as "<uuid>.webp" with a "<uuid>-thumb.webp" thumbnail
 * next to them. Older uploads (.jpg/.png/.webp kept as sent) have no thumbnail: their URL is
 * returned unchanged.
 */
const PROCESSED_UPLOAD = /^(.*\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/;

export function thumbUrl(url: string): string {
  const match = PROCESSED_UPLOAD.exec(url);
  return match ? `${match[1]}-thumb.webp` : url;
}
