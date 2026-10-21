import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { updateBookingRules } from "@/app/app/booking-rules-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingRulesForm } from "@/components/venue/booking-rules-form";
import { PublishControl } from "@/components/venue/publish-card";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BookingRules");
  return { title: t("title") };
}

// Правила брони и публикация страницы: только владелец (layout настроек).
export default async function BookingRulesPage({
  params,
}: PageProps<"/app/[venueId]/settings/booking">) {
  const tApp = await getTranslations("App");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
    >
      <BookingRulesContent params={params} />
    </Suspense>
  );
}

async function BookingRulesContent({
  params,
}: Pick<PageProps<"/app/[venueId]/settings/booking">, "params">) {
  const { venueId } = await params;
  const t = await getTranslations("BookingRules");
  const tVenue = await getTranslations("Venue");
  const supabase = await createClient();
  const [
    { data: venue },
    { count: resources },
    { count: tariffs },
    { count: photos },
  ] = await Promise.all([
    supabase
      .from("venues")
      .select(
        "id, slug, is_published, online_booking_enabled, slot_step_min, min_duration_min, buffer_min, min_lead_min, max_days_ahead, no_show_after_min",
      )
      .eq("id", venueId)
      .maybeSingle(),
    supabase
      .from("resources")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .eq("is_active", true),
    supabase
      .from("tariffs")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .eq("is_active", true),
    supabase
      .from("venue_photos")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId),
  ]);
  if (!venue) return <p role="alert">{tVenue("notFound")}</p>;

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title={t("title")} description={t("hint")} />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("publishTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PublishControl
            venueId={venue.id}
            published={venue.is_published}
            url={`${siteUrl()}/${venue.slug}`}
            checks={[
              { key: "checkHall", ok: Boolean(resources) },
              { key: "checkTariffs", ok: Boolean(tariffs) },
              { key: "checkPhotos", ok: Boolean(photos) },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("rulesTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BookingRulesForm
            action={updateBookingRules.bind(null, venue.id)}
            initial={venue}
          />
        </CardContent>
      </Card>
    </div>
  );
}
