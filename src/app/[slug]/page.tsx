import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PhotoGallery } from "@/components/public/photo-gallery";
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
        <main className="public-dark dark bg-background text-muted-foreground flex-1 px-4 py-6">
          <p className="mx-auto max-w-6xl">{t("loading")}</p>
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
  const photos = venue.photos.map(publicPhotoUrl);

  return (
    <div className="public-dark dark bg-background text-foreground flex flex-1 flex-col">
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-4 px-4 pt-4 pb-10 lg:gap-6 lg:pt-8">
        {photos.length > 0 ? (
          <PhotoGallery photos={photos} name={venue.name} />
        ) : (
          <div
            aria-hidden="true"
            className="from-primary/30 to-muted h-32 rounded-3xl bg-gradient-to-br sm:h-48"
          />
        )}

        <section className="bg-card grid gap-4 rounded-3xl p-5 sm:p-6">
          <div className="flex items-start gap-4">
            {photos[0] && (
              <Image
                src={photos[0]}
                alt=""
                width={64}
                height={64}
                unoptimized
                className="hidden size-16 shrink-0 rounded-2xl object-cover sm:block"
              />
            )}
            <div className="grid min-w-0 flex-1 gap-1">
              <p className="text-primary text-sm font-semibold">
                {tVenue(`types.${venue.type}`)}
              </p>
              <h1 className="text-3xl font-bold sm:text-4xl">{venue.name}</h1>
              <p className="text-muted-foreground flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="size-4 shrink-0" />
                {place}
              </p>
            </div>
          </div>

          <p className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                todayHours ? "bg-success" : "bg-muted-foreground",
              )}
            />
            <Clock
              aria-hidden="true"
              className="text-muted-foreground size-4"
            />
            {todayHours
              ? t("todayHours", {
                  from: hhmm(todayHours.open),
                  to: hhmm(todayHours.close),
                })
              : t("todayClosed")}
          </p>

          <div className="grid grid-cols-[1fr_auto_auto] gap-2 sm:flex">
            {bookable ? (
              <a
                href="#booking"
                className={cn(buttonVariants({ size: "lg" }), "sm:px-10")}
              >
                {tBooking("book")}
              </a>
            ) : (
              <span className="sm:hidden" />
            )}
            <a
              href={`https://2gis.kz/search/${encodeURIComponent(place)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("onMap")}
              title={t("onMap")}
              className={buttonVariants({
                variant: "outline",
                size: "icon-lg",
              })}
            >
              <MapPin aria-hidden="true" />
            </a>
            {venue.phone && (
              <a
                href={`tel:${venue.phone.replace(/[^\d+]/g, "")}`}
                aria-label={`${t("call")} ${venue.phone}`}
                title={`${t("call")} ${venue.phone}`}
                className={buttonVariants({
                  variant: "outline",
                  size: "icon-lg",
                })}
              >
                <Phone aria-hidden="true" />
              </a>
            )}
          </div>

          {venue.description && (
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
              {venue.description}
            </p>
          )}
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
          <div className="grid min-w-0 gap-4">
            {!venue.online_booking_enabled && (
              <p className="bg-card rounded-3xl p-5 text-sm">
                {t("bookingOff")}
              </p>
            )}

            {bookable && (
              <section
                id="booking"
                className="bg-card grid min-w-0 scroll-mt-4 gap-5 rounded-3xl p-4 sm:p-6"
                aria-labelledby="booking-title"
              >
                <h2 id="booking-title" className="text-2xl font-bold">
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
                  packages={venue.packages}
                />
              </section>
            )}
          </div>

          <aside className="grid content-start gap-4">
            <Prices venue={venue} />
            <Hours venue={venue} />
            <Rules venue={venue} />
          </aside>
        </div>
      </main>

      <footer className="text-muted-foreground border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-xs">
          {t("poweredBy", { product: tCommon("productName") })}
        </div>
      </footer>
    </div>
  );
}

async function Hours({ venue }: { venue: PublicVenue }) {
  const t = await getTranslations("Public");
  const tVenue = await getTranslations("Venue");
  return (
    <section
      className="bg-card grid gap-3 rounded-3xl p-5"
      data-testid="public-hours"
    >
      <h2 className="text-lg font-bold">{t("hoursTitle")}</h2>
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
      className="bg-card grid gap-3 rounded-3xl p-5"
      data-testid="public-prices"
    >
      <h2 className="text-lg font-bold">{t("pricesTitle")}</h2>
      <ul className="grid gap-2 text-sm">
        {venue.tariffs.map((x) => (
          <li
            key={`${x.name}-${x.time_from}`}
            className="bg-muted flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl px-3 py-2.5"
          >
            <span>
              <span className="font-medium">{x.name}</span>
              <span className="text-muted-foreground block">
                {when(x)}
                {showKinds &&
                  ` · ${x.resource_kinds.map((k) => tHall(`resourceKinds.${k}`)).join(", ")}`}
              </span>
            </span>
            <span className="font-bold tabular-nums">
              {t("perHour", { price: x.price_per_hour })}
            </span>
          </li>
        ))}
      </ul>
      {venue.packages.length > 0 && (
        <>
          <h3 className="font-semibold">{t("packagesTitle")}</h3>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {venue.packages.map((p) => (
              <li key={p.name} className="bg-muted grid rounded-xl px-3 py-2.5">
                <span className="font-semibold">{p.name}</span>
                <span className="text-muted-foreground">
                  {t("packageLine", { minutes: p.minutes, price: p.price })}
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
      className="bg-card grid gap-3 rounded-3xl p-5"
      data-testid="public-rules"
    >
      <h2 className="text-lg font-bold">{t("rulesTitle")}</h2>
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
