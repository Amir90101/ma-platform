import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { updateVenue } from "@/app/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VenueForm } from "@/components/venue/venue-form";
import { VenuePhotos } from "@/components/venue/venue-photos";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { workingDaySchema } from "@/lib/validation/venue";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Venue");
  return { title: t("settingsTitle") };
}

export default async function VenueSettingsPage({
  params,
}: PageProps<"/app/[venueId]/settings">) {
  const tApp = await getTranslations("App");
  return (
    <>
      <Suspense
        fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
      >
        <VenueSettings params={params} />
      </Suspense>
    </>
  );
}

async function VenueSettings({
  params,
}: {
  params: PageProps<"/app/[venueId]/settings">["params"];
}) {
  const { venueId } = await params;
  const t = await getTranslations("Venue");
  const supabase = await createClient();

  // Неверный uuid тоже даёт ошибку запроса — показываем «не найдено».
  const [{ data: venue }, { data: photoRows }] = await Promise.all([
    supabase.from("venues").select("*").eq("id", venueId).maybeSingle(),
    supabase
      .from("venue_photos")
      .select("id, storage_path")
      .eq("venue_id", venueId)
      .order("sort")
      .order("created_at"),
  ]);

  if (!venue) return <p role="alert">{t("notFound")}</p>;

  const photos = (photoRows ?? []).map((p) => ({
    id: p.id,
    storagePath: p.storage_path,
    url: supabase.storage.from("venue-photos").getPublicUrl(p.storage_path).data
      .publicUrl,
  }));
  const workingHours = workingDaySchema
    .array()
    .catch([])
    .parse(venue.working_hours);

  // Шаги из сценария 1 в docs/USER_FLOWS.md; карта, тарифы и правила —
  // следующие этапы.
  const steps = [
    { key: "profile", state: "done" },
    { key: "hall", state: "later" },
    { key: "tariffs", state: "later" },
    { key: "bookingRules", state: "later" },
    { key: "photos", state: photos.length ? "done" : "todo" },
    { key: "publish", state: "later" },
  ] as const;

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">{venue.name}</h1>
        <p className="text-muted-foreground">{t("settingsTitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("stepsTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2" data-testid="venue-steps">
            {steps.map((step) => (
              <li key={step.key} className="flex justify-between gap-4">
                <span>{t(`steps.${step.key}`)}</span>
                <span
                  className={
                    step.state === "done"
                      ? "text-emerald-700"
                      : "text-muted-foreground"
                  }
                >
                  {step.state === "done"
                    ? t("stepDone")
                    : step.state === "todo"
                      ? t("stepTodo")
                      : t("stepLater")}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("photosTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <VenuePhotos venueId={venue.id} photos={photos} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("profileTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <VenueForm
            action={updateVenue.bind(null, venue.id)}
            mode="edit"
            siteUrl={siteUrl()}
            initial={{
              type: venue.type,
              name: venue.name,
              slug: venue.slug,
              city: venue.city,
              address: venue.address ?? "",
              phone: venue.phone ?? "",
              description: venue.description ?? "",
              workingHours,
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
