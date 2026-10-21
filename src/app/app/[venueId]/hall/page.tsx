import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PencilRuler } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { HallView } from "@/components/hall/hall-view";
import { buttonVariants } from "@/components/ui/button";
import { loadHallLayout } from "@/lib/hall/load";
import { loadOpenSessions } from "@/lib/hall/open-sessions";
import { loadUpcomingBookings } from "@/lib/hall/upcoming-bookings";
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

  const [
    sessions,
    { data: venueRow },
    { data: allResources },
    { data: packages },
    { data: shift },
    bookings,
  ] = await Promise.all([
    loadOpenSessions(supabase, venue.id),
    supabase.from("venues").select("timezone").eq("id", venue.id).single(),
    supabase
      .from("resources")
      .select("id, name, hall_id")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("packages")
      .select("id, name")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("shifts")
      .select("id, opened_at, opening_cash")
      .eq("venue_id", venue.id)
      .is("closed_at", null)
      .maybeSingle(),
    loadUpcomingBookings(supabase, venue.id),
  ]);
  const hallNames = new Map((halls ?? []).map((h) => [h.id, h.name]));

  return (
    <>
      <PageHeader
        title={t("viewTitle")}
        description={t("viewHint")}
        actions={
          isOwner && (
            <Link
              href={`/app/${venue.id}/settings/hall${hall ? `?hall=${hall.id}` : ""}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <PencilRuler aria-hidden="true" />
              {t("openEditor")}
            </Link>
          )
        }
      />
      {hall ? (
        <HallView
          venueId={venue.id}
          timezone={venueRow?.timezone ?? "Asia/Almaty"}
          hall={hall}
          halls={halls!.map(({ id, name }) => ({ id, name }))}
          layout={await loadHallLayout(supabase, hall.id)}
          sessions={sessions}
          venueResources={(allResources ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            hallName: hallNames.get(r.hall_id) ?? "",
          }))}
          packages={packages ?? []}
          bookings={bookings}
          shift={
            shift
              ? {
                  id: shift.id,
                  openedAt: shift.opened_at,
                  openingCash: shift.opening_cash,
                }
              : null
          }
        />
      ) : (
        <p className="text-muted-foreground">{t("noHallView")}</p>
      )}
    </>
  );
}
