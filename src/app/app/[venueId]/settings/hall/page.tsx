import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { HallEditor } from "@/components/hall/hall-editor";
import { NewHallForm } from "@/components/hall/new-hall-form";
import { loadHallLayout } from "@/lib/hall/load";
import { resourceKindsFor } from "@/lib/venue-types";
import { getVenueAccess } from "@/lib/venue-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Hall");
  return { title: t("editorTitle") };
}

export default async function HallPage({
  params,
  searchParams,
}: PageProps<"/app/[venueId]/settings/hall">) {
  const tApp = await getTranslations("App");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
    >
      <Hall params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Hall({
  params,
  searchParams,
}: PageProps<"/app/[venueId]/settings/hall">) {
  const { venueId } = await params;
  const { hall: hallParam } = await searchParams;
  const t = await getTranslations("Hall");
  // Владельца проверил layout настроек.
  const access = await getVenueAccess(venueId);
  if (!access) return null;
  const { supabase, venue } = access;

  const { data: halls } = await supabase
    .from("halls")
    .select("id, name, width, height")
    .eq("venue_id", venue.id)
    .order("sort")
    .order("created_at");
  const hall = halls?.find((h) => h.id === hallParam) ?? halls?.[0];

  return (
    <>
      <PageHeader title={t("editorTitle")} />
      {hall ? (
        <HallEditor
          // Своё состояние у каждого зала: при переключении вкладки редактор
          // начинает с карты из базы.
          key={hall.id}
          venueId={venue.id}
          hall={hall}
          halls={halls!.map(({ id, name }) => ({ id, name }))}
          initialLayout={await loadHallLayout(supabase, hall.id)}
          resourceKinds={resourceKindsFor(venue.type)}
        />
      ) : (
        <div className="grid gap-4">
          <p className="text-muted-foreground">{t("noHall")}</p>
          <NewHallForm venueId={venue.id} defaultName={t("defaultHallName")} />
        </div>
      )}
    </>
  );
}
