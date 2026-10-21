import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookingFeed } from "@/components/bookings/booking-feed";
import { BookingForm } from "@/components/bookings/booking-form";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getVenueAccess } from "@/lib/venue-access";
import { addDays, isDateString, todayIn } from "@/lib/venue-time";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Bookings");
  return { title: t("title") };
}

// Лента броней на день: администратор и владелец.
export default async function BookingsPage({
  params,
  searchParams,
}: PageProps<"/app/[venueId]/bookings">) {
  const tApp = await getTranslations("App");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
    >
      <Bookings params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Bookings({
  params,
  searchParams,
}: PageProps<"/app/[venueId]/bookings">) {
  const { venueId } = await params;
  const { date: dateParam } = await searchParams;
  const t = await getTranslations("Bookings");
  const tVenue = await getTranslations("Venue");
  const access = await getVenueAccess(venueId);
  if (!access) return <p role="alert">{tVenue("notFound")}</p>;
  const { supabase, venue } = access;

  const [{ data: venueRow }, { data: halls }, { data: resources }] =
    await Promise.all([
      supabase.from("venues").select("timezone").eq("id", venue.id).single(),
      supabase
        .from("halls")
        .select("id, name")
        .eq("venue_id", venue.id)
        .order("sort")
        .order("created_at"),
      supabase
        .from("resources")
        .select("id, name, hall_id, is_active")
        .eq("venue_id", venue.id)
        .order("name"),
    ]);
  const timezone = venueRow?.timezone ?? "Asia/Almaty";
  const today = todayIn(timezone);
  const date = isDateString(dateParam) ? dateParam : today;
  // Момент рендера: «Не пришёл» доступно только после начала брони.
  const renderedAt = new Date().toISOString();
  const { data: bookings } = await supabase.rpc("get_day_bookings", {
    p_venue_id: venue.id,
    p_date: date,
  });

  // Столы по порядку залов, внутри зала — по названию.
  const hallOrder = new Map((halls ?? []).map((h, i) => [h.id, i]));
  const hallNames = new Map((halls ?? []).map((h) => [h.id, h.name]));
  const sorted = [...(resources ?? [])].sort(
    (a, b) =>
      (hallOrder.get(a.hall_id) ?? 0) - (hallOrder.get(b.hall_id) ?? 0) ||
      a.name.localeCompare(b.name, "ru", { numeric: true }),
  );
  const options = sorted.map((r) => ({
    id: r.id,
    name: r.name,
    hallName: (halls?.length ?? 0) > 1 ? (hallNames.get(r.hall_id) ?? "") : "",
    isActive: r.is_active,
  }));
  const href = (d: string) => `/app/${venue.id}/bookings?date=${d}`;
  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

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

      <nav className="flex flex-wrap items-end gap-2" aria-label={t("date")}>
        <Link
          href={href(addDays(date, -1))}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("prevDay")}
        </Link>
        {date !== today && (
          <Link
            href={href(today)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("today")}
          </Link>
        )}
        <Link
          href={href(addDays(date, 1))}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("nextDay")}
        </Link>
        {/* Обычная GET-форма: работает и до загрузки скриптов. */}
        <form
          className="flex items-end gap-2"
          action={`/app/${venue.id}/bookings`}
        >
          <div className="grid gap-1">
            <Label htmlFor="feed-date" className="text-xs">
              {t("date")}
            </Label>
            <Input
              id="feed-date"
              type="date"
              name="date"
              defaultValue={date}
              className="h-7"
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

      <h2
        className="text-lg font-medium first-letter:uppercase"
        data-testid="feed-date"
      >
        {dateLabel}
      </h2>
      <BookingFeed
        venueId={venue.id}
        date={date}
        timezone={timezone}
        now={renderedAt}
        resources={options}
        bookings={(bookings ?? []).map((b) => ({
          id: b.id,
          resourceId: b.resource_id,
          customerName: b.customer_name,
          customerPhone: b.customer_phone,
          noShowCount: b.no_show_count,
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          status: b.status,
          source: b.source,
          guests: b.guests,
          comment: b.comment,
          cancelReason: b.cancel_reason,
          cancelledByGuest: b.cancelled_by_guest,
        }))}
      />

      <BookingForm
        key={date}
        venueId={venue.id}
        date={date}
        timezone={timezone}
        resources={options.filter((r) => r.isActive)}
      />
    </>
  );
}
