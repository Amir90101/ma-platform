"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Совпадает с настройками бакета venue-photos в миграции.
const BUCKET = "venue-photos";
const MAX_SIZE = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type VenuePhoto = { id: string; storagePath: string; url: string };

// Загружает фото прямо в Storage браузерным клиентом: права проверяют
// политики бакета, строку venue_photos — RLS.
export function VenuePhotos({
  venueId,
  photos,
}: {
  venueId: string;
  photos: VenuePhoto[];
}) {
  const t = useTranslations("Venue");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function upload(files: FileList) {
    setError(undefined);
    const list = Array.from(files);
    const bad = list.find((f) => !EXTENSIONS[f.type]);
    if (bad) return setError("photoType");
    if (list.some((f) => f.size > MAX_SIZE)) return setError("photoTooBig");

    setBusy(true);
    const supabase = createClient();
    let sort = photos.length;
    for (const file of list) {
      const path = `${venueId}/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        setError("photoUpload");
        break;
      }
      const { error: rowError } = await supabase
        .from("venue_photos")
        .insert({ venue_id: venueId, storage_path: path, sort: sort++ });
      if (rowError) {
        await supabase.storage.from(BUCKET).remove([path]);
        setError("photoUpload");
        break;
      }
    }
    setBusy(false);
    startTransition(() => router.refresh());
  }

  async function remove(photo: VenuePhoto) {
    setError(undefined);
    setBusy(true);
    const supabase = createClient();
    const { error: rowError } = await supabase
      .from("venue_photos")
      .delete()
      .eq("id", photo.id);
    if (rowError) setError("photoDelete");
    // Файл без строки никому не виден; ошибку удаления файла не показываем.
    else await supabase.storage.from(BUCKET).remove([photo.storagePath]);
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">{t("photosHint")}</p>
      {photos.length === 0 ? (
        <p className="text-sm">{t("photosEmpty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, i) => (
            <li key={photo.id} className="relative" data-testid="venue-photo">
              <Image
                src={photo.url}
                alt={t("photoAlt", { n: i + 1 })}
                width={320}
                height={240}
                // Файлы отдаёт Storage; оптимизатор Next им не нужен.
                unoptimized
                className="bg-muted aspect-4/3 w-full rounded-lg object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                disabled={busy}
                onClick={() => remove(photo)}
                aria-label={`${t("deletePhoto")} ${i + 1}`}
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${error}`)}
        </p>
      )}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept={Object.keys(EXTENSIONS).join(",")}
          multiple
          hidden
          aria-label={t("addPhotos")}
          onChange={(e) => {
            if (e.target.files?.length) upload(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? t("uploading") : t("addPhotos")}
        </Button>
      </div>
    </div>
  );
}
