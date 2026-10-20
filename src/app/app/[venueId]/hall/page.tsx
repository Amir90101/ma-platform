import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { HallView } from "@/components/hall/hall-view";
import { loadHallLayout } from "@/lib/hall/load";
import { getVenueAccess } from "@/lib/venue-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Hall");
  return { title: t("viewTitle") };
}

// Рабочий экран: карта зала для администратора и владельца.
export default async function HallViewPage({
  params,
  searchParams,
}: PageProps<"/app/[venueId]/hall">) {
  const tApp = await getTranslations("App");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
    >
      <HallViewContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function HallViewContent({
  params,
  searchParams,
}: PageProps<"/app/[venueId]/hall">) {
  const { venueId } = await params;
  const { hall: hallParam } = await searchParams;
  const t = await getTranslations("Hall");
  const tVenue = await getTranslations("Venue");
  const access = await getVenueAccess(venueId);
  if (!access) return <p role="alert">{tVenue("notFound")}</p>;
  const { supabase, venue, isOwner } = access;

  const { data: halls } = await supabase
    .from("halls")
    .select("id, name, width, height")
    .eq("venue_id", venue.id)
    .order("sort")
    .order("created_at");
  const hall = halls?.find((h) => h.id === hallParam) ?? halls?.[0];

  return (
    <>
      <Link
        href={`/app/${venue.id}`}
        className="text-muted-foreground text-sm hover:underline"
      >
        {tVenue("home.backToVenue")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{venue.name}</h1>
          <p className="text-muted-foreground text-sm">{t("viewHint")}</p>
        </div>
        {isOwner && (
          <Link
            href={`/app/${venue.id}/settings/hall${hall ? `?hall=${hall.id}` : ""}`}
            className="text-sm hover:underline"
          >
            {t("openEditor")}
          </Link>
        )}
      </div>
      {hall ? (
        <HallView
          venueId={venue.id}
          hall={hall}
          halls={halls!.map(({ id, name }) => ({ id, name }))}
          layout={await loadHallLayout(supabase, hall.id)}
        />
      ) : (
        <p className="text-muted-foreground">{t("noHallView")}</p>
      )}
    </>
  );
}
