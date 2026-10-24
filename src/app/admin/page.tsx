import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Check, ExternalLink, Plus, Store } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader, StatCard } from "@/components/app-shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Platform");
  return { title: t("title") };
}

// Готовность настройки заведения — без денег и гостей.
const STEPS = ["hours", "resources", "tariffs", "photos", "staff"] as const;

export default async function PlatformPage({
  searchParams,
}: PageProps<"/admin">) {
  const t = await getTranslations("Platform");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{t("loading")}</p>}
    >
      <PlatformVenues searchParams={searchParams} />
    </Suspense>
  );
}

async function PlatformVenues({
  searchParams,
}: Pick<PageProps<"/admin">, "searchParams">) {
  const t = await getTranslations("Platform");
  const tVenue = await getTranslations("Venue");
  const tIntegration = await getTranslations("Integration");
  const { created } = await searchParams;
  const supabase = await createClient();
  const { data: venues } = await supabase.rpc("platform_venues");
  const list = venues ?? [];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Link href="/admin/new" className={buttonVariants({ size: "lg" })}>
            <Plus aria-hidden="true" />
            {t("add")}
          </Link>
        }
      />

      {typeof created === "string" && (
        <p
          role="status"
          className="bg-status-free-soft text-status-free rounded-2xl px-4 py-3 text-sm font-medium"
        >
          {t("created", { slug: created })}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label={t("statVenues")}
          value={list.length}
          icon={<Store />}
          testId="platform-venues-count"
        />
        <StatCard
          label={t("statPublished")}
          value={list.filter((v) => v.is_published).length}
          icon={<ExternalLink />}
        />
        <StatCard
          label={t("statReady")}
          value={list.filter((v) => STEPS.every((s) => done(v, s))).length}
          icon={<Check />}
        />
      </div>

      {list.length === 0 ? (
        <p className="bg-card shadow-card text-muted-foreground rounded-2xl p-6 text-center">
          {t("empty")}
        </p>
      ) : (
        <ul className="grid gap-3" data-testid="platform-venues">
          {list.map((v) => (
            <li
              key={v.id}
              data-testid="platform-venue"
              className="bg-card shadow-card grid gap-3 rounded-2xl p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
            >
              <div className="grid min-w-0 gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-lg font-bold">{v.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      v.is_published
                        ? "bg-status-free-soft text-status-free"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {v.is_published ? t("published") : t("notPublished")}
                  </span>
                  {v.booking_only && (
                    <span className="bg-sidebar rounded-full px-2.5 py-0.5 text-xs font-semibold text-white">
                      {v.iiko_enabled
                        ? tIntegration("badgeIiko")
                        : tIntegration("badgeBookingOnly")}
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground text-sm">
                  {tVenue(`types.${v.type}`)} · {v.city} · {v.org_name}
                </p>
                <p className="text-sm">
                  {t("owner")}:{" "}
                  <span className="font-medium">{v.owner_email}</span>
                </p>
              </div>
              <div className="grid gap-2 md:justify-items-end">
                <ul className="flex flex-wrap gap-1.5" aria-label={t("setup")}>
                  {STEPS.map((s) => (
                    <li
                      key={s}
                      className={cn(
                        "rounded-lg px-2 py-1 text-xs font-medium",
                        done(v, s)
                          ? "bg-status-free-soft text-status-free"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {t(`steps.${s}`)}
                      {s !== "hours" && ` · ${count(v, s)}`}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/admin/venues/${v.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {tIntegration("platformLink")}
                </Link>
                {v.is_published && (
                  <Link
                    href={`/${v.slug}`}
                    target="_blank"
                    className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
                  >
                    /{v.slug}
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

type PlatformVenue = {
  has_hours: boolean;
  resources: number;
  tariffs: number;
  photos: number;
  staff: number;
};

function count(v: PlatformVenue, step: (typeof STEPS)[number]) {
  return step === "hours" ? (v.has_hours ? 1 : 0) : v[step];
}

function done(v: PlatformVenue, step: (typeof STEPS)[number]) {
  return count(v, step) > 0;
}
