"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Фото заведения: листаются свайпом на телефоне, стрелками и превью на
// компьютере.
export function PhotoGallery({
  photos,
  name,
}: {
  photos: string[];
  name: string;
}) {
  const t = useTranslations("Public");
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const many = photos.length > 1;

  function show(i: number) {
    const el = track.current;
    if (!el) return;
    const next = (i + photos.length) % photos.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="bg-muted relative overflow-hidden rounded-3xl">
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex aspect-4/3 snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain sm:aspect-21/9"
        data-testid="public-photos"
      >
        {photos.map((src, i) => (
          <div key={src} className="relative w-full shrink-0 snap-center">
            <Image
              src={src}
              alt={t("photoAlt", { name, n: i + 1 })}
              fill
              sizes="(min-width: 1152px) 1152px, 100vw"
              // Файлы отдаёт Storage; оптимизатор Next им не нужен.
              unoptimized
              priority={i === 0}
              className="object-cover"
            />
          </div>
        ))}
      </div>
      {many && (
        <>
          <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white tabular-nums backdrop-blur">
            {t("photoCounter", { n: index + 1, total: photos.length })}
          </span>
          <button
            type="button"
            onClick={() => show(index - 1)}
            aria-label={t("prevPhoto")}
            className="absolute top-1/2 left-3 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 sm:grid"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => show(index + 1)}
            aria-label={t("nextPhoto")}
            className="absolute top-1/2 right-3 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 sm:grid"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {photos.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => show(i)}
                aria-label={t("showPhoto", { n: i + 1 })}
                aria-current={i === index}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === index ? "bg-primary w-6" : "w-2 bg-white/60",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
