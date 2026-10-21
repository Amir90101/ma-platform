import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  Globe,
  Map,
  ScrollText,
  Wallet,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader, StatCard } from "@/components/app-shell/page-header";
import { SetupChecklist } from "@/components/app-shell/setup-checklist";
import { siteUrl } from "@/lib/site-url";
import type { RevenueReport } from "@/lib/reports";
import type { Database } from "@/lib/supabase/types";
import { getVenueAccess } from "@/lib/venue-access";
import { todayIn } from "@/lib/venue-time";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Shell");
  return { title: t("items.overview") };
}

// Обзор заведения на сегодня: что занято, смена, брони, выручка.
export default async function VenueHomePage({
  params,
}: PageProps<"/app/[venueId]">) {
  const tApp = await getTranslations("App");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
    >
      <VenueHome params={params} />
    </Suspense>
  );
}

function CardLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}

async function VenueHome({
  params,
}: {
  params: PageProps<"/app/[venueId]">["params"];
}) {
  const { venueId } = await params;
  const t = await getTranslations("Venue");
  const tO = await getTranslations("Overview");
  const tShell = await getTranslations("Shell");
  const access = await getVenueAccess(venueId);
  if (!access) return <p role="alert">{t("notFound")}</p>;
  const { supabase, venue, isOwner } = access;

  const { data: info } = await supabase
    .from("venues")
    .select("timezone, slug, is_published")
    .eq("id", venue.id)
    .single();
  const timezone = info?.timezone ?? "Asia/Almaty";
  const today = todayIn(timezone);
  const nowIso = new Date().toISOString();
  const time = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(iso));

  const [
    { count: resources },
    { count: busy },
    { data: shift },
    { data: bookings },
    revenue,
    setup,
  ] = await Promise.all([
    supabase
      .from("resources")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venue.id)
      .eq("is_active", true),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venue.id)
      .in("status", ["active", "paused"]),
    supabase
      .from("shifts")
      .select("opened_at, opening_cash")
      .eq("venue_id", venue.id)
      .is("closed_at", null)
      .maybeSingle(),
    supabase.rpc("get_day_bookings", { p_venue_id: venue.id, p_date: today }),
    isOwner
      ? supabase.rpc("get_revenue_report", {
          p_venue_id: venue.id,
          p_from: today,
          p_to: today,
        })
      : Promise.resolve({ data: null }),
    isOwner ? setupState(supabase, venue.id) : Promise.resolve(null),
  ]);
  const active = (bookings ?? []).filter(
    (b) => b.status === "confirmed" || b.status === "arrived",
  );
  const next = active.find(
    (b) => b.status === "confirmed" && b.ends_at > nowIso,
  );
  const todayRevenue = (revenue.data as RevenueReport | null)?.total ?? 0;
  const free = Math.max((resources ?? 0) - (busy ?? 0), 0);
  const base = `/app/${venue.id}`;

  return (
    <>
      <PageHeader
        eyebrow={t(`types.${venue.type}`)}
        title={venue.name}
        description={
          <span data-testid="venue-role">
            {isOwner ? t("home.roleOwner") : t("home.roleAdmin")}
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="primary"
          icon={<Map />}
          label={tO("tables")}
          value={tO("freeOf", { free, total: resources ?? 0 })}
          hint={tO("busyNow", { count: busy ?? 0 })}
          footer={
            <Link
              href={`${base}/hall`}
              className="text-primary-foreground inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              {tO("openHall")}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          }
        />
        <StatCard
          icon={<Wallet />}
          label={tO("shift")}
          value={shift ? tO("shiftOpen") : tO("shiftClosed")}
          hint={
            shift
              ? tO("shiftSince", {
                  time: time(shift.opened_at),
                  cash: shift.opening_cash.toLocaleString("ru-RU"),
                })
              : tO("shiftHint")
          }
          footer={<CardLink href={`${base}/hall`}>{tO("toShift")}</CardLink>}
        />
        <StatCard
          icon={<CalendarClock />}
          label={tO("bookingsToday")}
          value={active.length}
          hint={
            next
              ? tO("nextBooking", {
                  time: time(next.starts_at),
                  guest: next.customer_name ?? next.customer_phone,
                })
              : tO("noNextBooking")
          }
          footer={
            <CardLink href={`${base}/bookings`}>{tO("toBookings")}</CardLink>
          }
        />
        {isOwner && (
          <StatCard
            icon={<Banknote />}
            label={tO("revenueToday")}
            value={tO("money", {
              amount: todayRevenue.toLocaleString("ru-RU"),
            })}
            hint={tO("revenueHint")}
            footer={
              <CardLink href={`${base}/reports?from=${today}&to=${today}`}>
                {tO("toReports")}
              </CardLink>
            }
          />
        )}
      </div>

      {setup && info && !(setup.every((s) => s) && info.is_published) && (
        <SetupChecklist
          steps={[
            { key: "hall", done: setup[0], href: `${base}/settings/hall` },
            {
              key: "tariffs",
              done: setup[1],
              href: `${base}/settings/tariffs`,
            },
            { key: "photos", done: setup[2], href: `${base}/settings` },
            {
              key: "publish",
              done: info.is_published,
              href: `${base}/settings/booking`,
            },
          ]}
        />
      )}

      {isOwner && info && (
        <section className="bg-card shadow-card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="bg-secondary text-secondary-foreground grid size-10 place-items-center rounded-lg"
            >
              <Globe className="size-5" />
            </span>
            <div className="grid gap-0.5">
              <h2 className="font-semibold">{tO("publicTitle")}</h2>
              {info.is_published ? (
                <a
                  href={`${siteUrl()}/${info.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-sm break-all hover:underline"
                >
                  {`${siteUrl()}/${info.slug}`}
                </a>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {tO("publicHidden")}
                </p>
              )}
            </div>
          </div>
          <CardLink href={`${base}/settings/booking`}>
            {tO("publicSettings")}
          </CardLink>
        </section>
      )}

      {/* На телефоне журнала нет в нижних вкладках — он здесь. */}
      {isOwner && (
        <Link
          href={`${base}/audit`}
          className="bg-card shadow-card flex items-center justify-between gap-3 rounded-2xl p-4 text-sm font-medium lg:hidden"
        >
          <span className="flex items-center gap-3">
            <ScrollText
              aria-hidden="true"
              className="text-muted-foreground size-5"
            />
            {tShell("items.audit")}
          </span>
          <ArrowRight
            aria-hidden="true"
            className="text-muted-foreground size-4"
          />
        </Link>
      )}
    </>
  );
}

// Готовы ли карта зала, цены и фото: [hall, tariffs, photos].
async function setupState(
  supabase: SupabaseClient<Database>,
  venueId: string,
): Promise<[boolean, boolean, boolean]> {
  const count = (
    table: "resources" | "tariffs" | "packages" | "venue_photos",
  ) =>
    supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .then(({ count }) => (count ?? 0) > 0);
  const [hall, tariffs, packages, photos] = await Promise.all([
    count("resources"),
    count("tariffs"),
    count("packages"),
    count("venue_photos"),
  ]);
  return [hall, tariffs || packages, photos];
}
