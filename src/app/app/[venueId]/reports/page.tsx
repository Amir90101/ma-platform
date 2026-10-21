import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { periodPresets, reportPeriod } from "@/lib/report-period";
import {
  type LoadReport,
  PAYMENT_METHODS,
  type RevenueReport,
} from "@/lib/reports";
import { getVenueAccess } from "@/lib/venue-access";
import { todayIn } from "@/lib/venue-time";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Reports");
  return { title: t("title") };
}

// Отчёты за период: только владелец (RPC проверяют is_venue_owner).
export default async function ReportsPage({
  params,
  searchParams,
}: PageProps<"/app/[venueId]/reports">) {
  const tApp = await getTranslations("App");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
    >
      <Reports params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({
  params,
  searchParams,
}: PageProps<"/app/[venueId]/reports">) {
  const { venueId } = await params;
  const query = await searchParams;
  const t = await getTranslations("Reports");
  const tVenue = await getTranslations("Venue");
  const access = await getVenueAccess(venueId);
  if (!access) return <p role="alert">{tVenue("notFound")}</p>;
  if (!access.isOwner) redirect(`/app/${venueId}`);
  const { supabase, venue } = access;

  const { data: venueRow } = await supabase
    .from("venues")
    .select("timezone")
    .eq("id", venue.id)
    .single();
  const today = todayIn(venueRow?.timezone ?? "Asia/Almaty");
  const { from, to } = reportPeriod(today, query.from, query.to);
  const period = { p_venue_id: venue.id, p_from: from, p_to: to };
  const [{ data, error }, { data: loadData }] = await Promise.all([
    supabase.rpc("get_revenue_report", period),
    supabase.rpc("get_load_report", period),
  ]);
  const revenue = data as RevenueReport | null;
  const load = loadData as LoadReport | null;
  const href = (p: { from: string; to: string }) =>
    `/app/${venue.id}/reports?from=${p.from}&to=${p.to}`;
  const money = (amount: number) =>
    t("money", { amount: amount.toLocaleString("ru-RU") });
  const dayLabel = (d: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${d}T00:00:00Z`));

  return (
    <>
      <Link
        href={`/app/${venue.id}`}
        className="text-muted-foreground text-sm hover:underline"
      >
        {tVenue("home.backToVenue")}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("hint")}</p>
      </div>

      <nav className="grid gap-3" aria-label={t("title")}>
        <div className="flex flex-wrap gap-2">
          {Object.entries(periodPresets(today)).map(([key, p]) => (
            <Link
              key={key}
              href={href(p)}
              aria-current={p.from === from && p.to === to ? "page" : undefined}
              className={buttonVariants({
                variant: p.from === from && p.to === to ? "default" : "outline",
                size: "sm",
              })}
            >
              {t(`presets.${key}`)}
            </Link>
          ))}
        </div>
        {/* Обычная GET-форма: работает и до загрузки скриптов. */}
        <form
          className="flex flex-wrap items-end gap-2"
          action={`/app/${venue.id}/reports`}
        >
          <div className="grid gap-1">
            <Label htmlFor="report-from" className="text-xs">
              {t("from")}
            </Label>
            <Input
              id="report-from"
              type="date"
              name="from"
              defaultValue={from}
              className="h-8"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="report-to" className="text-xs">
              {t("to")}
            </Label>
            <Input
              id="report-to"
              type="date"
              name="to"
              defaultValue={to}
              className="h-8"
            />
          </div>
          <button
            type="submit"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {t("show")}
          </button>
        </form>
      </nav>

      {error || !revenue ? (
        <p role="alert" className="text-destructive">
          {t("periodInvalid")}
        </p>
      ) : (
        <section className="grid gap-4" data-testid="revenue">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">{t("revenueTitle")}</h2>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <dt className="text-muted-foreground text-sm">{t("total")}</dt>
              <dd
                className="text-2xl font-semibold tabular-nums"
                data-testid="revenue-total"
              >
                {money(revenue.total)}
              </dd>
            </div>
            {PAYMENT_METHODS.map((m) => (
              <div key={m} className="rounded-lg border p-3">
                <dt className="text-muted-foreground text-sm">
                  {t(`methods.${m}`)}
                </dt>
                <dd
                  className="text-xl font-medium tabular-nums"
                  data-testid={`revenue-${m}`}
                >
                  {money(revenue.by_method[m])}
                </dd>
              </div>
            ))}
          </dl>

          {revenue.total === 0 ? (
            <p className="text-muted-foreground">{t("noRevenue")}</p>
          ) : (
            <>
              <div className="grid gap-2">
                <h3 className="font-medium">{t("byResource")}</h3>
                <table
                  className="w-full text-sm"
                  data-testid="revenue-resources"
                >
                  <thead className="text-muted-foreground text-left">
                    <tr>
                      <th className="py-1 font-normal">{t("resource")}</th>
                      <th className="py-1 text-right font-normal">
                        {t("sessions")}
                      </th>
                      <th className="py-1 text-right font-normal">
                        {t("total")}
                      </th>
                      <th className="w-1/3 py-1 pl-3 font-normal">
                        <span className="sr-only">{t("share")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {revenue.by_resource.map((r) => (
                      <tr key={r.resource_id}>
                        <td className="py-1.5">{r.name}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {r.sessions}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {money(r.total)}
                        </td>
                        <td className="py-1.5 pl-3">
                          <div
                            className="bg-primary/70 h-2 rounded-full"
                            style={{
                              width: `${(r.total / revenue.total) * 100}%`,
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-2">
                <h3 className="font-medium">{t("byDay")}</h3>
                <div className="overflow-x-auto">
                  <table
                    className="w-full min-w-md text-sm"
                    data-testid="revenue-days"
                  >
                    <thead className="text-muted-foreground text-left">
                      <tr>
                        <th className="py-1 font-normal">{t("day")}</th>
                        {PAYMENT_METHODS.map((m) => (
                          <th key={m} className="py-1 text-right font-normal">
                            {t(`methods.${m}`)}
                          </th>
                        ))}
                        <th className="py-1 text-right font-normal">
                          {t("total")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {revenue.by_day.map((d) => (
                        <tr
                          key={d.day}
                          className={
                            d.total === 0 ? "text-muted-foreground" : ""
                          }
                          data-day={d.day}
                        >
                          <td className="py-1.5">{dayLabel(d.day)}</td>
                          {PAYMENT_METHODS.map((m) => (
                            <td
                              key={m}
                              className="py-1.5 text-right tabular-nums"
                            >
                              {money(d[m])}
                            </td>
                          ))}
                          <td className="py-1.5 text-right font-medium tabular-nums">
                            {money(d.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {load && <LoadSection load={load} dayLabel={dayLabel} />}
    </>
  );
}

async function LoadSection({
  load,
  dayLabel,
}: {
  load: LoadReport;
  dayLabel: (day: string) => string;
}) {
  const t = await getTranslations("Reports");
  const hours = (minutes: number) =>
    t("hoursValue", {
      hours: (Math.round(minutes / 6) / 10).toLocaleString("ru-RU"),
    });
  const { bookings } = load;
  return (
    <>
      <section className="grid gap-3" data-testid="load">
        <h2 className="text-xl font-semibold">{t("loadTitle")}</h2>
        <p className="text-muted-foreground text-sm">{t("loadHint")}</p>
        {load.open_minutes === 0 ? (
          <p className="text-muted-foreground">{t("noOpenHours")}</p>
        ) : (
          <>
            <p className="text-sm">
              {t("openHours", {
                hours: (Math.round(load.open_minutes / 6) / 10).toLocaleString(
                  "ru-RU",
                ),
              })}
            </p>
            <table className="w-full text-sm" data-testid="load-resources">
              <thead className="text-muted-foreground text-left">
                <tr>
                  <th className="py-1 font-normal">{t("resource")}</th>
                  <th className="py-1 text-right font-normal">{t("busy")}</th>
                  <th className="py-1 text-right font-normal">
                    {t("percent")}
                  </th>
                  <th className="w-1/3 py-1 pl-3 font-normal">
                    <span className="sr-only">{t("percent")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {load.resources.map((r) => (
                  <tr key={r.resource_id}>
                    <td className="py-1.5">{r.name}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {hours(r.busy_minutes)}
                    </td>
                    <td className="py-1.5 text-right font-medium tabular-nums">
                      {(r.percent ?? 0).toLocaleString("ru-RU")} %
                    </td>
                    <td className="py-1.5 pl-3">
                      <div className="bg-muted h-2 overflow-hidden rounded-full">
                        <div
                          className="bg-primary/70 h-full rounded-full"
                          style={{ width: `${Math.min(r.percent ?? 0, 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="grid gap-3" data-testid="bookings-stats">
        <h2 className="text-xl font-semibold">{t("bookingsTitle")}</h2>
        <p className="text-muted-foreground text-sm">{t("bookingsHint")}</p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <dt className="text-muted-foreground text-sm">
              {t("bookingsTotal")}
            </dt>
            <dd
              className="text-xl font-medium tabular-nums"
              data-testid="bookings-total"
            >
              {bookings.total}
            </dd>
          </div>
          <div className="rounded-lg border p-3">
            <dt className="text-muted-foreground text-sm">
              {t("onlineShare")}
            </dt>
            <dd
              className="text-xl font-medium tabular-nums"
              data-testid="bookings-online"
            >
              {t("onlineShareValue", {
                count: bookings.online,
                share: (bookings.online_share ?? 0).toLocaleString("ru-RU"),
              })}
            </dd>
          </div>
          <div className="rounded-lg border p-3">
            <dt className="text-muted-foreground text-sm">
              {t("noShowsTotal")}
            </dt>
            <dd
              className="text-xl font-medium tabular-nums"
              data-testid="bookings-no-show"
            >
              {bookings.no_show}
            </dd>
          </div>
          <div className="rounded-lg border p-3">
            <dt className="text-muted-foreground text-sm">
              {t("onlineNoShows")}
            </dt>
            <dd className="text-xl font-medium tabular-nums">
              {bookings.online_no_show}
            </dd>
          </div>
        </dl>
        {bookings.no_show === 0 ? (
          <p className="text-muted-foreground">{t("noNoShows")}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <h3 className="font-medium">{t("noShowsByDay")}</h3>
              <ul className="divide-y text-sm">
                {load.no_shows_by_day.map((d) => (
                  <li key={d.day} className="flex justify-between py-1.5">
                    <span>{dayLabel(d.day)}</span>
                    <span className="tabular-nums">{d.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid content-start gap-2">
              <h3 className="font-medium">{t("noShowsByGuest")}</h3>
              <ul className="divide-y text-sm" data-testid="no-show-guests">
                {load.no_shows_by_guest.map((g) => (
                  <li
                    key={g.phone}
                    className="flex justify-between gap-2 py-1.5"
                  >
                    <span>
                      {g.name ?? t("noName")}{" "}
                      <a
                        href={`tel:${g.phone}`}
                        className="text-muted-foreground hover:underline"
                      >
                        {g.phone}
                      </a>
                    </span>
                    <span className="tabular-nums">{g.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
