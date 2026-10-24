import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  BookingOnlySwitch,
  IikoVenueSettings,
} from "@/components/integration/iiko-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isPlatformAdmin } from "@/lib/platform";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Integration");
  return { title: t("platformTitle") };
}

// Режим заведения и iiko меняет только владелец платформы (этап 9.5).
export default async function PlatformVenuePage({
  params,
}: PageProps<"/admin/venues/[venueId]">) {
  const t = await getTranslations("Platform");
  return (
    <>
      <Link
        href="/admin"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {t("title")}
      </Link>
      <Suspense
        fallback={<p className="text-muted-foreground">{t("loading")}</p>}
      >
        <VenueIntegration params={params} />
      </Suspense>
    </>
  );
}

async function VenueIntegration({
  params,
}: Pick<PageProps<"/admin/venues/[venueId]">, "params">) {
  const { venueId } = await params;
  const t = await getTranslations("Integration");
  // Права проверил layout /admin; ключ service_role — только после проверки.
  if (!(await isPlatformAdmin())) notFound();
  const db = createAdminClient();
  const [{ data: venue }, { data: integration }, { count: tables }] =
    await Promise.all([
      db
        .from("venues")
        .select("id, name, booking_only")
        .eq("id", venueId)
        .maybeSingle(),
      db
        .from("venue_integrations")
        .select(
          "api_login_secret_id, enabled, organization_id, terminal_group_id, section_ids, synced_at",
        )
        .eq("venue_id", venueId)
        .maybeSingle(),
      db
        .from("resources")
        .select("id", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .eq("is_active", true)
        .not("iiko_table_id", "is", null),
    ]);
  if (!venue) notFound();

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        eyebrow={t("platformTitle")}
        title={venue.name}
        description={t("iikoHint")}
      />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("modeTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BookingOnlySwitch venueId={venue.id} on={venue.booking_only} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("iikoTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <IikoVenueSettings
            venueId={venue.id}
            state={{
              hasKey: Boolean(integration?.api_login_secret_id),
              enabled: Boolean(integration?.enabled),
              organizationId: integration?.organization_id ?? null,
              terminalGroupId: integration?.terminal_group_id ?? null,
              sectionIds: integration?.section_ids ?? [],
              syncedAt: integration?.synced_at ?? null,
              tables: tables ?? 0,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
