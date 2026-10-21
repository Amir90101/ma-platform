"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  type BookingActionResult,
  cancelBooking,
  markNoShow,
} from "@/app/app/booking-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useVenueRealtime } from "@/lib/hooks/use-venue-realtime";
import type { Database } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { todayIn } from "@/lib/venue-time";

type BookingStatus = Database["public"]["Enums"]["booking_status"];
type BookingSource = Database["public"]["Enums"]["booking_source"];

export type FeedResource = {
  id: string;
  name: string;
  hallName: string;
  isActive: boolean;
};

export type FeedBooking = {
  id: string;
  resourceId: string;
  customerName: string | null;
  customerPhone: string;
  noShowCount: number;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  source: BookingSource;
  guests: number | null;
  comment: string | null;
  cancelReason: string | null;
  cancelledByGuest: boolean;
};

const REALTIME_TABLES = ["bookings"] as const;

const STATUS_TONE: Record<BookingStatus, string> = {
  confirmed: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  arrived:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
  no_show: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

// Лента дня по столам. Изменения броней в других окнах приходят через
// Realtime, и страница перечитывается с сервера.
export function BookingFeed({
  venueId,
  date,
  timezone,
  now,
  resources,
  bookings,
}: {
  venueId: string;
  date: string;
  timezone: string;
  now: string;
  resources: FeedResource[];
  bookings: FeedBooking[];
}) {
  const t = useTranslations("Bookings");
  const realtime = useVenueRealtime(venueId, REALTIME_TABLES);
  const byResource = Map.groupBy(bookings, (b) => b.resourceId);
  const active = bookings.filter(
    (b) => b.status === "confirmed" || b.status === "arrived",
  ).length;

  return (
    <section
      className="grid gap-3"
      data-testid="booking-feed"
      data-realtime={realtime}
    >
      <p className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
        <span data-testid="feed-count">{t("count", { count: active })}</span>
        <span>{realtime === "on" ? t("live") : t("connecting")}</span>
      </p>
      {bookings.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        resources
          .filter((r) => byResource.has(r.id))
          .map((r) => (
            <div
              key={r.id}
              className="grid gap-2"
              data-testid="feed-resource"
              data-resource={r.name}
            >
              <h3 className="font-medium">
                {r.name}
                {r.hallName && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · {r.hallName}
                  </span>
                )}
              </h3>
              <ul className="grid gap-2">
                {byResource.get(r.id)!.map((b) => (
                  <BookingItem
                    key={b.id}
                    booking={b}
                    date={date}
                    timezone={timezone}
                    started={Date.parse(b.startsAt) <= Date.parse(now)}
                  />
                ))}
              </ul>
            </div>
          ))
      )}
    </section>
  );
}

function BookingItem({
  booking: b,
  date,
  timezone,
  started,
}: {
  booking: FeedBooking;
  date: string;
  timezone: string;
  started: boolean;
}) {
  const t = useTranslations("Bookings");
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const time = (iso: string) => formatTime(iso, timezone);
  // Ночная бронь из следующих суток: показываем и дату.
  const otherDay = todayIn(timezone, new Date(b.startsAt)) !== date;
  const inactive = b.status !== "confirmed" && b.status !== "arrived";

  const run = (action: () => Promise<BookingActionResult>) =>
    startTransition(async () => {
      const r = await action();
      setError(r.ok ? undefined : r.error);
    });

  return (
    <li
      className={cn(
        "grid gap-1.5 rounded-lg border p-3 text-sm",
        inactive && "opacity-70",
      )}
      data-testid="feed-booking"
      data-status={b.status}
    >
      <p className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-medium tabular-nums">
          {time(b.startsAt)}–{time(b.endsAt)}
          {otherDay && (
            <span className="text-muted-foreground text-sm font-normal">
              {" "}
              ({formatDay(b.startsAt, timezone)})
            </span>
          )}
        </span>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-xs font-medium",
            STATUS_TONE[b.status],
          )}
          data-testid="booking-status"
        >
          {t(`status.${b.status}`)}
        </span>
      </p>
      <p className="flex flex-wrap gap-x-2">
        <span className="font-medium">{b.customerName ?? t("noName")}</span>
        <a href={`tel:${b.customerPhone}`} className="hover:underline">
          {b.customerPhone}
        </a>
        {b.guests && (
          <span className="text-muted-foreground">
            {t("guestsCount", { count: b.guests })}
          </span>
        )}
        <span className="text-muted-foreground">{t(`source.${b.source}`)}</span>
      </p>
      {b.noShowCount > 0 && (
        <p
          className="font-medium text-amber-700 dark:text-amber-400"
          data-testid="booking-no-shows"
        >
          {t("noShows", { count: b.noShowCount })}
        </p>
      )}
      {b.comment && <p className="text-muted-foreground">{b.comment}</p>}
      {b.status === "cancelled" && (
        <p className="text-muted-foreground">
          {b.cancelledByGuest
            ? t("cancelledByGuest")
            : t("cancelReason", { reason: b.cancelReason ?? "" })}
        </p>
      )}

      {b.status === "confirmed" &&
        (cancelling ? (
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => cancelBooking(b.id, reason));
            }}
          >
            <Label htmlFor={`reason-${b.id}`}>{t("cancelReasonLabel")}</Label>
            <Input
              id={`reason-${b.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={pending || !hydrated}
              >
                {t("confirmCancel")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCancelling(false);
                  setError(undefined);
                }}
              >
                {t("back")}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {started && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || !hydrated}
                onClick={() => run(() => markNoShow(b.id))}
              >
                {t("noShow")}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !hydrated}
              onClick={() => setCancelling(true)}
            >
              {t("cancel")}
            </Button>
          </div>
        ))}
      {error && (
        <p className="text-destructive" data-testid="booking-error">
          {t(`errors.${error}`)}
        </p>
      )}
    </li>
  );
}

export function formatTime(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

function formatDay(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}
