"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Layout } from "@/lib/validation/hall";
import type { EditorItem } from "./hall-editor";

const HallCanvas = dynamic(() => import("./hall-canvas"), {
  ssr: false,
  loading: () => <div className="bg-muted/30 size-full animate-pulse" />,
});

// Карта для рабочего экрана: без перетаскивания и сохранения. Выключенные
// ресурсы не показываем — на них нельзя запускать сеансы.
export function HallView({
  venueId,
  hall,
  halls,
  layout,
}: {
  venueId: string;
  hall: { id: string; width: number; height: number };
  halls: { id: string; name: string }[];
  layout: Layout;
}) {
  const t = useTranslations("Hall");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const resources = layout.resources.filter((r) => r.is_active);
  const items: EditorItem[] = [
    ...layout.objects.map((o) => ({
      ...o,
      type: "object" as const,
      key: o.id!,
    })),
    ...resources.map((r) => ({ ...r, type: "resource" as const, key: r.id! })),
  ];

  return (
    <div className="grid gap-4">
      {halls.length > 1 && (
        <nav aria-label={t("halls")} className="flex flex-wrap gap-2">
          {halls.map((h) => (
            <Link
              key={h.id}
              href={`/app/${venueId}/hall?hall=${h.id}`}
              aria-current={h.id === hall.id ? "page" : undefined}
              className="hover:bg-muted aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground rounded-md px-3 py-1.5 text-sm"
            >
              {h.name}
            </Link>
          ))}
        </nav>
      )}

      <div
        className="relative w-full overflow-hidden rounded-lg border"
        style={{ aspectRatio: `${hall.width} / ${hall.height}` }}
      >
        <HallCanvas
          hall={hall}
          items={items}
          selectedKey={selectedKey}
          editable={false}
          onSelect={setSelectedKey}
          onChange={() => {}}
        />
      </div>

      <section className="grid gap-2">
        <h2 className="font-medium">{t("resourcesTitle")}</h2>
        <ul className="flex flex-wrap gap-2" data-testid="hall-resources">
          {resources.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelectedKey(r.id!)}
                aria-pressed={r.id === selectedKey}
                className="hover:bg-muted aria-pressed:border-primary rounded-md border px-3 py-1.5 text-sm"
              >
                {r.name}
                {r.capacity ? ` · ${r.capacity}` : ""}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
