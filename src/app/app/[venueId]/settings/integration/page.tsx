import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  BookingOnlySwitch,
  IikoSettings,
} from "@/components/integration/iiko-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getVenueAccess } from "@/lib/venue-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Integration");
  return { title: t("title") };
}

export default async function IntegrationPage({
  params,
}: PageProps<"/app/[venueId]/settings/integration">) {
  const tApp = await getTranslations("App");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
    >
      <Integration params={params} />
    </Suspense>
  );
}

async function Integration({
  params,
}: Pick<PageProps<"/app/[venueId]/settings/integration">, "params">) {
  const { venueId } = await params;
  const t = await getTranslations("Integration");
  // Владельца проверил layout настроек; настройки закрыты RLS.
  const access = await getVenueAccess(venueId);
  if (!access) return null;
  const { supabase, venue } = access;
  const [{ data: integration }, { count: tables }, { data: failed }] =
    await Promise.all([
      supabase
        .from("venue_integrations")
        .select(
          "api_login_secret_id, enabled, organization_id, terminal_group_id, section_ids, synced_at",
        )
        .eq("venue_id", venueId)
        .maybeSingle(),
      supabase
        .from("resources")
        .select("id", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .eq("is_active", true)
        .not("iiko_table_id", "is", null),
      supabase
        .from("bookings")
        .select("id, starts_at, iiko_error")
        .eq("venue_id", venueId)
        .eq("iiko_status", "error")
        .order("starts_at", { ascending: false })
        .limit(10),
    ]);

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title={t("title")} description={t("hint")} />

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("modeTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BookingOnlySwitch venueId={venueId} on={venue.booking_only} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("iikoTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-muted-foreground text-sm">{t("iikoHint")}</p>
          <IikoSettings
            venueId={venueId}
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

      {!!failed?.length && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("failedTitle")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm" data-testid="iiko-failed">
              {failed.map((b) => (
                <li key={b.id} className="grid gap-0.5 py-2">
                  <span className="font-medium">
                    {new Date(b.starts_at).toLocaleString("ru-RU")}
                  </span>
                  <span className="text-destructive">{b.iiko_error}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
