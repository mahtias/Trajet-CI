import { useRef, useState } from "react";
import { useUploadImage } from "@workspace/api-client-react";
import { ImagePlus, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // must match the server limit

interface ImageUploaderProps {
  value: string[];
  onChange: (images: string[]) => void;
  max?: number;
}

/**
 * Uploads images to POST /admin/uploads and keeps the list of returned URLs.
 * Removing a thumbnail only drops it from the list; the file stays on the server.
 */
export function ImageUploader({ value, onChange, max = 5 }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const uploadImage = useUploadImage();
  const { toast } = useToast();

  const remaining = max - value.length;

  const uploadFiles = async (files: File[]) => {
    const accepted = files.filter((file) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast({ title: "Format non accepté", description: `${file.name} : JPG, PNG ou WEBP uniquement`, variant: "destructive" });
        return false;
      }
      if (file.size > MAX_SIZE) {
        toast({ title: "Fichier trop volumineux", description: `${file.name} dépasse 5 Mo`, variant: "destructive" });
        return false;
      }
      return true;
    });

    if (accepted.length > remaining) {
      toast({ title: `${max} images maximum`, description: `Seules les ${remaining} première(s) seront ajoutées.`, variant: "destructive" });
    }
    const toUpload = accepted.slice(0, Math.max(0, remaining));
    if (toUpload.length === 0) return;

    setUploadingCount(toUpload.length);
    const urls: string[] = [];
    // One at a time keeps the order and makes errors easy to attribute
    for (const file of toUpload) {
      try {
        const { url } = await uploadImage.mutateAsync({ data: { file } });
        urls.push(url);
      } catch (err: any) {
        toast({ title: "Échec de l'envoi", description: `${file.name} : ${err?.data?.error ?? err?.message ?? "erreur inconnue"}`, variant: "destructive" });
      }
      setUploadingCount((n) => n - 1);
    }
    if (urls.length > 0) onChange([...value, ...urls]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (remaining > 0 && uploadingCount === 0) uploadFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {value.map((url, i) => (
            <div key={url + i} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted group">
              <img src={url} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
              {i === 0 && (
                <span className="absolute bottom-1 left-1 text-[10px] font-bold bg-background/90 px-1.5 py-0.5 rounded">Principale</span>
              )}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 bg-background/90 hover:bg-destructive hover:text-destructive-foreground rounded-full p-1 shadow"
                aria-label="Retirer l'image"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => uploadingCount === 0 && inputRef.current?.click()}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && uploadingCount === 0) inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg p-4 text-sm text-muted-foreground cursor-pointer transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            uploadingCount > 0 && "cursor-wait opacity-70",
          )}
        >
          {uploadingCount > 0 ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Envoi en cours ({uploadingCount})…</>
          ) : (
            <>
              <ImagePlus className="w-5 h-5" />
              <span className="font-medium text-foreground">Ajouter une photo</span>
              <span className="text-xs">ou glisser-déposer · JPG, PNG, WEBP · 5 Mo max · encore {remaining}</span>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={(e) => {
          uploadFiles(Array.from(e.target.files ?? []));
          e.target.value = ""; // allow picking the same file again
        }}
      />
    </div>
  );
}
