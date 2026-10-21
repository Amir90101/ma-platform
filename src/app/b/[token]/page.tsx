import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CancelBooking } from "@/components/public/cancel-booking";
import { createPublicClient } from "@/lib/supabase/public";
import type { Database } from "@/lib/supabase/types";

type BookingStatus = Database["public"]["Enums"]["booking_status"];

// Ответ get_booking_by_token: без имени и телефона гостя.
type GuestBooking = {
  code: string;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  guests: number | null;
  cancelled_by_guest: boolean;
  can_cancel: boolean;
  resource_name: string;
  venue: {
    name: string;
    slug: string;
    address: string | null;
    phone: string | null;
    timezone: string;
    no_show_after_min: number;
  };
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("GuestBooking");
  // Личная ссылка гостя: не для поисковиков и не для превью.
  return { title: t("title"), robots: { index: false, follow: false } };
}

// Страница брони по личной ссылке /b/{token}: статус и отмена.
export default async function GuestBookingPage({
  params,
}: PageProps<"/b/[token]">) {
  const t = await getTranslations("GuestBooking");
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Suspense
        fallback={<p className="text-muted-foreground">{t("loading")}</p>}
      >
        <GuestBookingContent params={params} />
      </Suspense>
    </main>
  );
}

async function GuestBookingContent({
  params,
}: Pick<PageProps<"/b/[token]">, "params">) {
  const { token } = await params;
  await connection();
  const { data } = await createPublicClient().rpc("get_booking_by_token", {
    p_token: token,
  });
  const booking = data as GuestBooking | null;
  if (!booking) notFound();
  const t = await getTranslations("GuestBooking");
  const { venue } = booking;
  const date = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: venue.timezone,
  }).format(new Date(booking.starts_at));
  const time = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: venue.timezone,
    }).format(new Date(iso));

  return (
    <article className="grid gap-5" data-testid="guest-booking">
      <header className="grid gap-1">
        <p className="text-muted-foreground text-sm">
          {t("code", { code: booking.code })}
        </p>
        <h1 className="text-2xl font-semibold">
          <Link href={`/${venue.slug}`} className="hover:underline">
            {venue.name}
          </Link>
        </h1>
        <p
          className="bg-muted w-fit rounded-md px-2 py-0.5 text-sm font-medium"
          data-testid="guest-booking-status"
        >
          {booking.status === "cancelled" && booking.cancelled_by_guest
            ? t("status.cancelledByGuest")
            : t(`status.${booking.status}`)}
        </p>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t("when")}</dt>
        <dd className="first-letter:uppercase">
          {date}, {time(booking.starts_at)}–{time(booking.ends_at)}
        </dd>
        <dt className="text-muted-foreground">{t("place")}</dt>
        <dd>{booking.resource_name}</dd>
        {booking.guests && (
          <>
            <dt className="text-muted-foreground">{t("guests")}</dt>
            <dd>{booking.guests}</dd>
          </>
        )}
        {venue.address && (
          <>
            <dt className="text-muted-foreground">{t("address")}</dt>
            <dd>{venue.address}</dd>
          </>
        )}
        {venue.phone && (
          <>
            <dt className="text-muted-foreground">{t("phone")}</dt>
            <dd>
              <a
                href={`tel:${venue.phone.replace(/[^\d+]/g, "")}`}
                className="hover:underline"
              >
                {venue.phone}
              </a>
            </dd>
          </>
        )}
      </dl>

      {booking.status === "confirmed" && (
        <p className="text-muted-foreground text-sm">
          {t("rules", { minutes: venue.no_show_after_min })}
        </p>
      )}

      {booking.can_cancel ? (
        <CancelBooking token={token} />
      ) : (
        booking.status === "confirmed" && (
          <p className="text-sm" data-testid="cancel-too-late">
            {t("tooLate")}
          </p>
        )
      )}
    </article>
  );
}
