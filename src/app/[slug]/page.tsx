import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PublicBooking } from "@/components/public/public-booking";
import { Clock, MapPin, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getPublicVenue,
  publicPhotoUrl,
  type PublicVenue,
} from "@/lib/public-venue";
import { formatWeekdays, hhmm } from "@/lib/schedule-format";
import { siteUrl } from "@/lib/site-url";
import { isoWeekday, todayIn } from "@/lib/venue-time";

export async function generateMetadata({
  params,
}: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const venue = await getPublicVenue(slug);
  if (!venue) {
    const t = await getTranslations("Public");
    return { title: t("notFoundTitle"), robots: { index: false } };
  }
  const description =
    venue.description ?? [venue.city, venue.address].filter(Boolean).join(", ");
  const image = venue.photos[0] ? publicPhotoUrl(venue.photos[0]) : null;
  return {
    title: venue.name,
    description,
    openGraph: {
      type: "website",
      locale: "ru_RU",
      url: `${siteUrl()}/${venue.slug}`,
      title: venue.name,
      description,
      images: image ? [{ url: image }] : undefined,
    },
  };
}

// Публичная страница заведения: открывается с телефона по ссылке из
// Instagram, 2ГИС или WhatsApp. Данные — только get_public_venue.
export default async function PublicVenuePage({
  params,
}: PageProps<"/[slug]">) {
  const t = await getTranslations("Public");
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <p className="text-muted-foreground">{t("loading")}</p>
        </main>
      }
    >
      <VenueContent params={params} />
    </Suspense>
  );
}

async function VenueContent({ params }: Pick<PageProps<"/[slug]">, "params">) {
  const { slug } = await params;
  const venue = await getPublicVenue(slug);
  if (!venue) notFound();
  const t = await getTranslations("Public");
  const tVenue = await getTranslations("Venue");
  const tCommon = await getTranslations("Common");
  const tBooking = await getTranslations("PublicBooking");
  const bookable =
    venue.online_booking_enabled &&
    venue.halls.some((h) => h.resources.some((r) => r.bookable_online));
  const place = [venue.city, venue.address].filter(Boolean).join(", ");
  const today = todayIn(venue.timezone);
  const todayHours = venue.working_hours.find(
    (d) => d.weekday === isoWeekday(today),
  );
  const [cover, ...more] = venue.photos;

  return (
    <div className="flex flex-1 flex-col">
      <main className="flex-1">
        {/* Обложка: первое фото, поверх — название и адрес. */}
        <section className="bg-sidebar relative isolate overflow-hidden">
          <div className="absolute inset-0 -z-10" data-testid="public-photos">
            {cover && (
              <Image
                src={publicPhotoUrl(cover)}
                alt={t("photoAlt", { name: venue.name, n: 1 })}
                fill
                // Файлы отдаёт Storage; оптимизатор Next им не нужен.
                unoptimized
                priority
                className="object-cover"
              />
            )}
          </div>
          {more.length > 0 && (
            <div className="absolute right-4 bottom-4 z-10 hidden gap-2 sm:flex">
              {more.slice(0, 3).map((path, i) => (
                <Image
                  key={path}
                  src={publicPhotoUrl(path)}
                  alt={t("photoAlt", { name: venue.name, n: i + 2 })}
                  width={96}
                  height={72}
                  unoptimized
                  className="aspect-4/3 w-20 rounded-lg border-2 border-white/80 object-cover shadow-lg"
                />
              ))}
            </div>
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/40 to-black/10"
          />
          <div className="mx-auto grid min-h-72 w-full max-w-6xl content-end gap-3 px-4 pt-24 pb-8 text-white sm:min-h-96">
            <p className="text-sm font-medium text-white/80">
              {tVenue(`types.${venue.type}`)}
            </p>
            <h1 className="text-4xl font-semibold sm:text-5xl">{venue.name}</h1>
            <p className="flex items-center gap-1.5 text-white/90">
              <MapPin aria-hidden="true" className="size-4 shrink-0" />
              {place}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {bookable && (
                <a
                  href="#booking"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "hidden lg:inline-flex",
                  )}
                >
                  {tBooking("book")}
                </a>
              )}
              <a
                href={`https://2gis.kz/search/${encodeURIComponent(place)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "secondary", size: "lg" }),
                  "bg-white/15 text-white backdrop-blur hover:bg-white/25",
                )}
              >
                <MapPin aria-hidden="true" />
                {t("onMap")}
              </a>
              {venue.phone && (
                <a
                  href={`tel:${venue.phone.replace(/[^\d+]/g, "")}`}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "lg" }),
                    "bg-white/15 text-white backdrop-blur hover:bg-white/25",
                  )}
                >
                  <Phone aria-hidden="true" />
                  {t("call")} {venue.phone}
                </a>
              )}
            </div>
          </div>
        </section>

        <div className="mx-auto grid w-full max-w-6xl items-start gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-10">
          <div className="grid min-w-0 gap-6">
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Clock aria-hidden="true" className="size-4" />
              {todayHours
                ? t("todayHours", {
                    from: hhmm(todayHours.open),
                    to: hhmm(todayHours.close),
                  })
                : t("todayClosed")}
            </p>

            {venue.description && (
              <p className="text-lg leading-relaxed whitespace-pre-line">
                {venue.description}
              </p>
            )}

            {!venue.online_booking_enabled && (
              <p className="bg-card rounded-2xl border p-5 text-sm shadow-xs">
                {t("bookingOff")}
              </p>
            )}

            {bookable && (
              <section
                id="booking"
                className="bg-card grid scroll-mt-4 gap-4 rounded-2xl border p-4 shadow-sm sm:p-6"
                aria-labelledby="booking-title"
              >
                <h2 id="booking-title" className="text-2xl font-semibold">
                  {tBooking("title")}
                </h2>
                <PublicBooking
                  venueId={venue.id}
                  timezone={venue.timezone}
                  today={today}
                  maxDaysAhead={venue.max_days_ahead}
                  minDuration={venue.min_duration_min}
                  slotStep={venue.slot_step_min}
                  noShowAfterMin={venue.no_show_after_min}
                  halls={venue.halls}
                />
              </section>
            )}
          </div>

          <aside className="grid content-start gap-6">
            <Hours venue={venue} />
            <Prices venue={venue} />
            <Rules venue={venue} />
          </aside>
        </div>
      </main>

      <footer className="text-muted-foreground border-t pb-24 lg:pb-0">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-xs">
          {t("poweredBy", { product: tCommon("productName") })}
        </div>
      </footer>

      {/* На телефоне кнопка брони всегда под пальцем. */}
      {bookable && (
        <div className="bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <a
            href="#booking"
            className={cn(buttonVariants({ size: "lg" }), "w-full")}
          >
            {tBooking("book")}
          </a>
        </div>
      )}
    </div>
  );
}

async function Hours({ venue }: { venue: PublicVenue }) {
  const t = await getTranslations("Public");
  const tVenue = await getTranslations("Venue");
  return (
    <section
      className="bg-card grid gap-3 rounded-2xl border p-5 shadow-xs"
      data-testid="public-hours"
    >
      <h2 className="font-semibold">{t("hoursTitle")}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        {[1, 2, 3, 4, 5, 6, 7].map((day) => {
          const hours = venue.working_hours.find((d) => d.weekday === day);
          return (
            <div key={day} className="contents">
              <dt className="text-muted-foreground">
                {tVenue(`weekdays.${day}`)}
              </dt>
              <dd className="tabular-nums">
                {hours
                  ? `${hhmm(hours.open)}–${hhmm(hours.close)}`
                  : t("dayOff")}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

async function Prices({ venue }: { venue: PublicVenue }) {
  if (venue.tariffs.length === 0 && venue.packages.length === 0) return null;
  const t = await getTranslations("Public");
  const tVenue = await getTranslations("Venue");
  const tHall = await getTranslations("Hall");
  const labels = Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7].map((d) => [d, tVenue(`weekdays.${d}`)]),
  );
  // Виды ресурсов подписываем, только если цены у них разные.
  const kinds = new Set(venue.tariffs.flatMap((x) => x.resource_kinds));
  const showKinds =
    kinds.size > 1 &&
    venue.tariffs.some((x) => x.resource_kinds.length < kinds.size);
  const when = (x: PublicVenue["tariffs"][number]) =>
    hhmm(x.time_from) === hhmm(x.time_to)
      ? `${formatWeekdays(x.weekdays, labels)}, ${t("allDay")}`
      : t("tariffWhen", {
          days: formatWeekdays(x.weekdays, labels),
          from: hhmm(x.time_from),
          to: hhmm(x.time_to),
        });

  return (
    <section
      className="bg-card grid gap-3 rounded-2xl border p-5 shadow-xs"
      data-testid="public-prices"
    >
      <h2 className="font-semibold">{t("pricesTitle")}</h2>
      <ul className="divide-y rounded-lg border text-sm">
        {venue.tariffs.map((x) => (
          <li
            key={`${x.name}-${x.time_from}`}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2"
          >
            <span>
              <span className="font-medium">{x.name}</span>
              <span className="text-muted-foreground block">
                {when(x)}
                {showKinds &&
                  ` · ${x.resource_kinds.map((k) => tHall(`resourceKinds.${k}`)).join(", ")}`}
              </span>
            </span>
            <span className="font-medium tabular-nums">
              {t("perHour", { price: x.price_per_hour })}
            </span>
          </li>
        ))}
      </ul>
      {venue.packages.length > 0 && (
        <>
          <h3 className="font-medium">{t("packagesTitle")}</h3>
          <ul className="grid gap-1 text-sm">
            {venue.packages.map((p) => (
              <li key={p.name}>
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {t("packageLine", { minutes: p.minutes, price: p.price })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

async function Rules({ venue }: { venue: PublicVenue }) {
  const t = await getTranslations("Public");
  return (
    <section
      className="bg-card grid gap-3 rounded-2xl border p-5 shadow-xs"
      data-testid="public-rules"
    >
      <h2 className="font-semibold">{t("rulesTitle")}</h2>
      <ul className="text-muted-foreground grid list-disc gap-1 pl-5 text-sm">
        <li>{t("rulePayOnSite")}</li>
        <li>{t("ruleHold", { minutes: venue.no_show_after_min })}</li>
        <li>{t("ruleMinDuration", { minutes: venue.min_duration_min })}</li>
        {venue.online_booking_enabled && (
          <li>
            {t("ruleLead", {
              minutes: venue.min_lead_min,
              days: venue.max_days_ahead,
            })}
          </li>
        )}
        <li>{t("ruleCancel")}</li>
      </ul>
    </section>
  );
}
