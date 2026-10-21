import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Store } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("App");
  return { title: t("title") };
}

export default async function AppHome() {
  const t = await getTranslations("App");
  return (
    <>
      <PageHeader title={t("venuesTitle")} />
      <Suspense
        fallback={<p className="text-muted-foreground">{t("loading")}</p>}
      >
        <VenueList />
      </Suspense>
    </>
  );
}

async function VenueList() {
  const t = await getTranslations("App");
  const tVenue = await getTranslations("Venue");
  const supabase = await createClient();
  // RLS отдаёт только заведения организаций пользователя.
  const { data: venues } = await supabase
    .from("venues")
    .select("id, name, city, type")
    .order("created_at");

  if (!venues?.length) {
    return (
      <div className="bg-card grid justify-items-center gap-4 rounded-2xl border border-dashed px-6 py-12 text-center">
        <span
          aria-hidden="true"
          className="bg-secondary text-secondary-foreground grid size-14 place-items-center rounded-2xl"
        >
          <Store className="size-7" />
        </span>
        <p className="text-muted-foreground max-w-md">{t("noVenues")}</p>
        <Link href="/app/new" className={buttonVariants({ size: "lg" })}>
          <Plus aria-hidden="true" />
          {t("createFirstVenue")}
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {venues.map((venue) => (
        <li key={venue.id}>
          <Link
            href={`/app/${venue.id}`}
            className="bg-card hover:border-primary/40 group shadow-card flex h-full items-center gap-4 rounded-2xl p-4 transition-colors"
          >
            <span
              aria-hidden="true"
              className="bg-primary text-primary-foreground grid size-12 shrink-0 place-items-center rounded-xl"
            >
              <Store className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{venue.name}</span>
              <span className="text-muted-foreground text-sm">
                {tVenue(`types.${venue.type}`)} · {venue.city}
              </span>
            </span>
            <ArrowRight
              aria-hidden="true"
              className="text-muted-foreground group-hover:text-primary size-5 shrink-0 transition-colors"
            />
          </Link>
        </li>
      ))}
      <li>
        <Link
          href="/app/new"
          className="text-muted-foreground hover:text-foreground hover:border-primary border-input flex h-full min-h-20 items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-sm font-medium transition-colors"
        >
          <Plus aria-hidden="true" className="size-4" />
          {t("addVenue")}
        </Link>
      </li>
    </ul>
  );
}
