import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { createHall } from "@/app/app/hall-actions";
import { HallEditor } from "@/components/hall/hall-editor";
import { Button } from "@/components/ui/button";
import { loadHallLayout } from "@/lib/hall/load";
import { resourceKindsFor } from "@/lib/venue-types";
import { getVenueAccess } from "@/lib/venue-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Hall");
  return { title: t("editorTitle") };
}

export default async function HallPage({
  params,
}: PageProps<"/app/[venueId]/settings/hall">) {
  const tApp = await getTranslations("App");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
    >
      <Hall params={params} />
    </Suspense>
  );
}

async function Hall({
  params,
}: {
  params: PageProps<"/app/[venueId]/settings/hall">["params"];
}) {
  const { venueId } = await params;
  const t = await getTranslations("Hall");
  // Владельца проверил layout настроек.
  const access = await getVenueAccess(venueId);
  if (!access) return null;
  const { supabase, venue } = access;

  const { data: hall } = await supabase
    .from("halls")
    .select("id, name, width, height")
    .eq("venue_id", venue.id)
    .order("sort")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("editorTitle")}</h1>
      {hall ? (
        <HallEditor
          venueId={venue.id}
          hall={hall}
          initialLayout={await loadHallLayout(supabase, hall.id)}
          resourceKinds={resourceKindsFor(venue.type)}
        />
      ) : (
        <form
          action={createHall.bind(null, venue.id, t("defaultHallName"))}
          className="grid justify-items-start gap-4"
        >
          <p className="text-muted-foreground">{t("noHall")}</p>
          <Button type="submit">{t("createHall")}</Button>
        </form>
      )}
    </>
  );
}
