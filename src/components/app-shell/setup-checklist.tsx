import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

export type SetupStep = {
  key: "hall" | "tariffs" | "photos" | "publish";
  done: boolean;
  href: string;
};

// Что владельцу осталось настроить, чтобы принимать гостей и брони.
export async function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const t = await getTranslations("Overview");
  const done = steps.filter((s) => s.done).length;
  return (
    <section
      className="bg-card grid gap-4 rounded-xl border p-5 shadow-xs"
      data-testid="setup-checklist"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="grid gap-1">
          <h2 className="font-semibold">{t("setupTitle")}</h2>
          <p className="text-muted-foreground text-sm">{t("setupHint")}</p>
        </div>
        <p className="text-sm font-medium tabular-nums">
          {t("setupProgress", { done, total: steps.length })}
        </p>
      </div>
      <div
        className="bg-muted h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        aria-label={t("setupTitle")}
      >
        <div
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${(done / steps.length) * 100}%` }}
        />
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className={cn(
                "hover:bg-muted flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors",
                step.done && "text-muted-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border",
                  step.done && "bg-success border-transparent text-white",
                )}
              >
                {step.done && <Check className="size-4" />}
              </span>
              <span className="flex-1">
                <span
                  className={cn(
                    "block font-medium",
                    !step.done && "text-foreground",
                  )}
                >
                  {t(`setup.${step.key}.title`)}
                </span>
                <span className="text-muted-foreground text-xs">
                  {step.done ? t("setupDone") : t(`setup.${step.key}.hint`)}
                </span>
              </span>
              {!step.done && (
                <ArrowRight
                  aria-hidden="true"
                  className="text-primary size-4"
                />
              )}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
