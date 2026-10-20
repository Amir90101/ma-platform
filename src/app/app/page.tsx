import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("venuesTitle")}</h1>
      </div>
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
      <div className="grid justify-items-start gap-4">
        <p className="text-muted-foreground">{t("noVenues")}</p>
        <Link href="/app/new" className={buttonVariants()}>
          {t("createFirstVenue")}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <ul className="divide-y rounded-lg border">
        {venues.map((venue) => (
          <li key={venue.id}>
            <Link
              href={`/app/${venue.id}`}
              className="hover:bg-muted flex items-center justify-between gap-4 px-4 py-3"
            >
              <span>
                <span className="block font-medium">{venue.name}</span>
                <span className="text-muted-foreground text-sm">
                  {tVenue(`types.${venue.type}`)} · {venue.city}
                </span>
              </span>
              <span className="text-sm">{t("openVenue")}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div>
        <Link
          href="/app/new"
          className={buttonVariants({ variant: "outline" })}
        >
          {t("addVenue")}
        </Link>
      </div>
    </div>
  );
}
