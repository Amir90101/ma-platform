import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PublicBooking } from "@/components/public/public-booking";
import { buttonVariants } from "@/components/ui/button";
import {
  getPublicVenue,
  publicPhotoUrl,
  type PublicVenue,
} from "@/lib/public-venue";
import { formatWeekdays, hhmm } from "@/lib/schedule-format";
import { siteUrl } from "@/lib/site-url";
import { todayIn } from "@/lib/venue-time";

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
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <Suspense
        fallback={<p className="text-muted-foreground">{t("loading")}</p>}
      >
        <VenueContent params={params} />
      </Suspense>
    </main>
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

  return (
    <article className="grid gap-6">
      {venue.photos.length > 0 && (
        <div
          className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
          data-testid="public-photos"
        >
          {venue.photos.map((path, i) => (
            <Image
              key={path}
              src={publicPhotoUrl(path)}
              alt={t("photoAlt", { name: venue.name, n: i + 1 })}
              width={640}
              height={480}
              // Файлы отдаёт Storage; оптимизатор Next им не нужен.
              unoptimized
              priority={i === 0}
              className="bg-muted aspect-4/3 w-[85%] shrink-0 snap-center rounded-xl object-cover sm:w-[70%]"
            />
          ))}
        </div>
      )}

      <header className="grid gap-2">
        <p className="text-muted-foreground text-sm">
          {tVenue(`types.${venue.type}`)}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{venue.name}</h1>
        <p>{place}</p>
        <div className="flex flex-wrap gap-2">
          {bookable && (
            <a href="#booking" className={buttonVariants({ size: "sm" })}>
              {tBooking("book")}
            </a>
          )}
          <a
            href={`https://2gis.kz/search/${encodeURIComponent(place)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("onMap")}
          </a>
          {venue.phone && (
            <a
              href={`tel:${venue.phone.replace(/[^\d+]/g, "")}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t("call")} {venue.phone}
            </a>
          )}
        </div>
      </header>

      {!venue.online_booking_enabled && (
        <p className="rounded-lg border p-3 text-sm">{t("bookingOff")}</p>
      )}

      {venue.description && (
        <p className="leading-relaxed whitespace-pre-line">
          {venue.description}
        </p>
      )}

      {bookable && (
        <section
          id="booking"
          className="grid scroll-mt-4 gap-3"
          aria-labelledby="booking-title"
        >
          <h2 id="booking-title" className="text-lg font-medium">
            {tBooking("title")}
          </h2>
          <PublicBooking
            venueId={venue.id}
            timezone={venue.timezone}
            today={todayIn(venue.timezone)}
            maxDaysAhead={venue.max_days_ahead}
            minDuration={venue.min_duration_min}
            slotStep={venue.slot_step_min}
            halls={venue.halls}
          />
        </section>
      )}

      <Hours venue={venue} />
      <Prices venue={venue} />
      <Rules venue={venue} />

      <footer className="text-muted-foreground border-t pt-4 text-xs">
        {t("poweredBy", { product: tCommon("productName") })}
      </footer>
    </article>
  );
}

async function Hours({ venue }: { venue: PublicVenue }) {
  const t = await getTranslations("Public");
  const tVenue = await getTranslations("Venue");
  return (
    <section className="grid gap-2" data-testid="public-hours">
      <h2 className="text-lg font-medium">{t("hoursTitle")}</h2>
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
    <section className="grid gap-2" data-testid="public-prices">
      <h2 className="text-lg font-medium">{t("pricesTitle")}</h2>
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
    <section className="grid gap-2" data-testid="public-rules">
      <h2 className="text-lg font-medium">{t("rulesTitle")}</h2>
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
