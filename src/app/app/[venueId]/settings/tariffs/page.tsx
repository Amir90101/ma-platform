import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  deletePackage,
  deleteTariff,
  savePackage,
  saveTariff,
} from "@/app/app/tariff-actions";
import { PackageForm, TariffForm } from "@/components/tariffs/tariff-forms";
import { WeekGrid } from "@/components/tariffs/week-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { workingDaySchema } from "@/lib/validation/venue";
import { resourceKindsFor } from "@/lib/venue-types";
import { getVenueAccess } from "@/lib/venue-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Tariffs");
  return { title: t("title") };
}

export default async function TariffsPage({
  params,
}: PageProps<"/app/[venueId]/settings/tariffs">) {
  const tApp = await getTranslations("App");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
    >
      <Tariffs params={params} />
    </Suspense>
  );
}

async function Tariffs({
  params,
}: Pick<PageProps<"/app/[venueId]/settings/tariffs">, "params">) {
  const { venueId } = await params;
  const t = await getTranslations("Tariffs");
  const tHall = await getTranslations("Hall");
  const tVenue = await getTranslations("Venue");
  // Владельца проверил layout настроек.
  const access = await getVenueAccess(venueId);
  if (!access) return null;
  const { supabase, venue } = access;

  const [
    { data: tariffs },
    { data: packages },
    { data: hours },
    { data: res },
  ] = await Promise.all([
    supabase
      .from("tariffs")
      .select("*")
      .eq("venue_id", venue.id)
      .order("priority", { ascending: false })
      .order("created_at"),
    supabase
      .from("packages")
      .select("*")
      .eq("venue_id", venue.id)
      .order("created_at"),
    supabase.from("venues").select("working_hours").eq("id", venue.id).single(),
    supabase
      .from("resources")
      .select("kind")
      .eq("venue_id", venue.id)
      .eq("is_active", true),
  ]);

  const kinds = resourceKindsFor(venue.type);
  // Сетка по видам, которые стоят на карте; пока карты нет — по виду заведения.
  const gridKinds = [...new Set((res ?? []).map((r) => r.kind))];
  if (!gridKinds.length) gridKinds.push(...kinds.filter((k) => k !== "other"));
  const workingHours = workingDaySchema
    .array()
    .catch([])
    .parse(hours?.working_hours);
  const grids = await Promise.all(
    gridKinds.map(async (kind) => ({
      kind,
      slots:
        (
          await supabase.rpc("tariff_week_grid", {
            p_venue_id: venue.id,
            p_kind: kind,
          })
        ).data ?? [],
    })),
  );

  const days = (weekdays: number[]) =>
    weekdays.map((d) => tVenue(`weekdays.${d}`)).join(", ");
  const time = (s: string) => s.slice(0, 5);

  return (
    <>
      <PageHeader title={t("title")} description={t("hint")} />

      <Card>
        <CardContent className="grid gap-6">
          <p className="text-muted-foreground text-sm">{t("gridHint")}</p>
          {grids.map((g) => (
            <WeekGrid
              key={g.kind}
              title={t("gridTitle", { kind: tHall(`resourceKinds.${g.kind}`) })}
              slots={g.slots}
              workingHours={workingHours}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("tariffsTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-3" data-testid="tariff-list">
            {(tariffs ?? []).map((tariff) => (
              <li key={tariff.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {tariff.name}
                      {!tariff.is_active && (
                        <span className="text-muted-foreground font-normal">
                          {" · "}
                          {t("inactive")}
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {t("perHour", { price: tariff.price_per_hour })} ·{" "}
                      {days(tariff.weekdays)} · {time(tariff.time_from)}–
                      {time(tariff.time_to)}
                      {tariff.time_to <= tariff.time_from &&
                        ` (${t("overnight")})`}
                    </p>
                  </div>
                  <form action={deleteTariff.bind(null, venue.id, tariff.id)}>
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      aria-label={t("deleteLabel", { name: tariff.name })}
                    >
                      {t("delete")}
                    </Button>
                  </form>
                </div>
                <details className="mt-2">
                  <summary
                    className="cursor-pointer text-sm hover:underline"
                    aria-label={t("editLabel", { name: tariff.name })}
                  >
                    {t("edit")}
                  </summary>
                  <div className="pt-3">
                    <TariffForm
                      idPrefix={`tariff-${tariff.id}`}
                      action={saveTariff.bind(null, venue.id, tariff.id)}
                      kinds={kinds}
                      initial={{
                        ...tariff,
                        time_from: time(tariff.time_from),
                        time_to: time(tariff.time_to),
                      }}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
          {!tariffs?.length && (
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
          )}
          <details className="rounded-lg border p-3" open={!tariffs?.length}>
            <summary className="cursor-pointer font-medium">
              {t("newTariff")}
            </summary>
            <div className="pt-3">
              <TariffForm
                idPrefix="tariff-new"
                action={saveTariff.bind(null, venue.id, null)}
                kinds={kinds}
              />
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("packagesTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-muted-foreground text-sm">{t("packagesHint")}</p>
          <ul className="grid gap-3" data-testid="package-list">
            {(packages ?? []).map((pkg) => (
              <li key={pkg.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {pkg.name}
                      {!pkg.is_active && (
                        <span className="text-muted-foreground font-normal">
                          {" · "}
                          {t("inactive")}
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {t("packageLine", {
                        minutes: pkg.minutes,
                        price: pkg.price,
                      })}
                    </p>
                  </div>
                  <form action={deletePackage.bind(null, venue.id, pkg.id)}>
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      aria-label={t("deleteLabel", { name: pkg.name })}
                    >
                      {t("delete")}
                    </Button>
                  </form>
                </div>
                <details className="mt-2">
                  <summary
                    className="cursor-pointer text-sm hover:underline"
                    aria-label={t("editLabel", { name: pkg.name })}
                  >
                    {t("edit")}
                  </summary>
                  <div className="pt-3">
                    <PackageForm
                      idPrefix={`package-${pkg.id}`}
                      action={savePackage.bind(null, venue.id, pkg.id)}
                      kinds={kinds}
                      initial={pkg}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">
              {t("newPackage")}
            </summary>
            <div className="pt-3">
              <PackageForm
                idPrefix="package-new"
                action={savePackage.bind(null, venue.id, null)}
                kinds={kinds}
              />
            </div>
          </details>
        </CardContent>
      </Card>
    </>
  );
}
