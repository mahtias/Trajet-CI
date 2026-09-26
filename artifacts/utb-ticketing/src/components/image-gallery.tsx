import { useState, type ComponentType } from "react";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

interface ImageThumbProps {
  src: string | null | undefined;
  alt: string;
  /** Icon shown on the neutral placeholder when there's no image (or it fails to load). */
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}

/** A single cover image with a neutral placeholder when missing or broken. */
export function ImageThumb({ src, alt, icon: Icon = ImageOff, className }: ImageThumbProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={cn("bg-muted flex items-center justify-center text-muted-foreground", className)} aria-label={alt} role="img">
        <Icon className="w-10 h-10 opacity-60" />
      </div>
    );
  }

  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn("object-cover", className)} />;
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
              <ImageThumb src={src} alt={`${alt} ${i + 1}`} icon={icon} className="w-full h-full" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
