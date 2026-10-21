"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setPublished } from "@/app/app/booking-rules-actions";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// Публикация страницы /{slug} и что стоит заполнить перед ней.
export function PublishControl({
  venueId,
  published,
  url,
  checks,
}: {
  venueId: string;
  published: boolean;
  url: string;
  checks: { key: "checkHall" | "checkTariffs" | "checkPhotos"; ok: boolean }[];
}) {
  const t = useTranslations("BookingRules");
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="grid gap-3" data-testid="publish-control">
      {published ? (
        <p>
          {t("published")}{" "}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium break-all underline"
          >
            {url}
          </a>
        </p>
      ) : (
        <p>{t("hidden")}</p>
      )}
      <div className="grid gap-1 text-sm">
        <p className="font-medium">{t("checklist")}</p>
        <ul className="grid gap-1">
          {checks.map((c) => (
            <li key={c.key} className="flex justify-between gap-4">
              <span>{t(c.key)}</span>
              <span
                className={c.ok ? "text-emerald-700" : "text-muted-foreground"}
              >
                {c.ok ? t("checkOk") : t("checkMissing")}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {t(`errors.${error}`)}
        </p>
      )}
      <div>
        <Button
          variant={published ? "outline" : "default"}
          disabled={pending || !hydrated}
          onClick={() =>
            startTransition(async () => {
              const r = await setPublished(venueId, !published);
              setError(r.ok ? undefined : r.error);
            })
          }
        >
          {published ? t("unpublish") : t("publish")}
        </Button>
      </div>
    </div>
  );
}
