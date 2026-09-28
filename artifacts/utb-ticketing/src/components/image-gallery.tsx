import { useEffect, useState, type ComponentType } from "react";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { thumbUrl } from "@/lib/images";

interface ImageThumbProps {
  src: string | null | undefined;
  alt: string;
  /** Icon shown on the neutral placeholder when there's no image (or it fails to load). */
  icon?: ComponentType<{ className?: string }>;
  className?: string;
  /** Load the small "-thumb" version (lists, previews); falls back to the full image if it's missing. */
  thumbnail?: boolean;
}

/** A single cover image with a neutral placeholder when missing or broken. */
export function ImageThumb({ src, alt, icon: Icon = ImageOff, className, thumbnail = false }: ImageThumbProps) {
  // Candidates tried in order: thumbnail (if asked and it exists by convention), then the full image
  const candidates = src ? Array.from(new Set(thumbnail ? [thumbUrl(src), src] : [src])) : [];
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [src, thumbnail]);

  const current = candidates[attempt];
  if (!current) {
    return (
      <div className={cn("bg-muted flex items-center justify-center text-muted-foreground", className)} aria-label={alt} role="img">
        <Icon className="w-10 h-10 opacity-60" />
      </div>
    );
  }

  return (
    <img
      src={current}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setAttempt((n) => n + 1)}
      className={cn("object-cover", className)}
    />
  );
}

interface ImageGalleryProps {
  images: string[] | null | undefined;
  alt: string;
  icon?: ComponentType<{ className?: string }>;
}

/** Main image plus clickable thumbnails; falls back to the placeholder when there are no images. */
export function ImageGallery({ images, alt, icon }: ImageGalleryProps) {
  const list = images ?? [];
  const [selected, setSelected] = useState(0);
  const current = list[Math.min(selected, list.length - 1)];

  return (
    <div>
      <ImageThumb key={current} src={current} alt={alt} icon={icon} className="w-full aspect-video" />
      {list.length > 1 && (
        <div className="flex gap-2 p-2 overflow-x-auto">
          {list.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setSelected(i)}
              className={cn(
                "shrink-0 w-20 h-14 rounded-md overflow-hidden border-2 transition-colors",
                i === selected ? "border-primary" : "border-transparent opacity-70 hover:opacity-100",
              )}
              aria-label={`Voir l'image ${i + 1}`}
            >
              <ImageThumb src={src} alt={`${alt} ${i + 1}`} icon={icon} className="w-full h-full" thumbnail />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
