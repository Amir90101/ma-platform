"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { todayIn } from "@/lib/venue-time";

type Alert = {
  id: string;
  resource: string;
  startsAt: string;
  endsAt: string;
  guest: string;
  phone: string;
  guests: number | null;
  noShows: number;
  timezone: string;
};

// Короткий двойной сигнал без файла: Web Audio. Браузер может не дать
// звук до первого клика на странице — тогда остаётся только карточка.
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i ? 1046 : 784;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + offset + 0.2,
      );
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    // Нет Web Audio — без звука.
  }
}

// Уведомление о новой онлайн-брони на всех экранах заведения. Строку брони
// присылает Realtime (RLS пускает только участников), подробности
// дочитываются запросом.
export function OnlineBookingAlerts() {
  const { venueId } = useParams<{ venueId: string }>();
  const t = useTranslations("Bookings");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;

    async function show(id: string) {
      const [{ data: b }, { data: venue }] = await Promise.all([
        supabase
          .from("bookings")
          .select(
            "id, starts_at, ends_at, guests, customer_id, resources(name), customers(name, phone)",
          )
          .eq("id", id)
          .single(),
        supabase.from("venues").select("timezone").eq("id", venueId).single(),
      ]);
      if (!b || cancelled) return;
      const { count } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", b.customer_id)
        .eq("status", "no_show");
      beep();
      setAlerts((list) => [
        {
          id: b.id,
          resource: b.resources?.name ?? "",
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          guest: b.customers?.name ?? "",
          phone: b.customers?.phone ?? "",
          guests: b.guests,
          noShows: count ?? 0,
          timezone: venue?.timezone ?? "Asia/Almaty",
        },
        ...list,
      ]);
    }

    // Сессия из cookie не вызывает событие входа: токен передаём явно.
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session) {
        await supabase.realtime.setAuth(data.session.access_token);
      }
      channel = supabase
        .channel(`online-bookings-${venueId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "bookings",
            filter: `venue_id=eq.${venueId}`,
          },
          (payload) => {
            const row = payload.new as { id: string; source: string };
            if (row.source === "online") show(row.id);
          },
        )
        .subscribe((status) => setSubscribed(status === "SUBSCRIBED"));
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [venueId]);

  // Маркер подписки: по нему e2e ждёт, что уведомления подключены.
  const marker = (
    <span
      hidden
      data-testid="online-alerts"
      data-realtime={subscribed ? "on" : "connecting"}
    />
  );
  if (alerts.length === 0) return marker;
  return (
    <>
      {marker}
      <div
        className="fixed inset-x-4 bottom-4 z-50 grid gap-2 sm:left-auto sm:w-96"
        aria-live="assertive"
      >
        {alerts.map((a) => {
          const time = (iso: string) =>
            new Intl.DateTimeFormat("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: a.timezone,
            }).format(new Date(iso));
          const day = new Intl.DateTimeFormat("ru-RU", {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone: a.timezone,
          }).format(new Date(a.startsAt));
          return (
            <div
              key={a.id}
              className="bg-background grid gap-1.5 rounded-lg border border-sky-300 p-4 text-sm shadow-lg dark:border-sky-800"
              data-testid="online-booking-alert"
            >
              <p className="font-semibold">{t("alertTitle")}</p>
              <p>
                {a.resource} · {day} · {time(a.startsAt)}–{time(a.endsAt)}
              </p>
              <p>
                {a.guest} ·{" "}
                <a href={`tel:${a.phone}`} className="hover:underline">
                  {a.phone}
                </a>
                {a.guests && <> · {t("guestsCount", { count: a.guests })}</>}
              </p>
              {a.noShows > 0 && (
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  {t("noShows", { count: a.noShows })}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  href={`/app/${venueId}/bookings?date=${todayIn(a.timezone, new Date(a.startsAt))}`}
                  className={buttonVariants({ size: "sm" })}
                  onClick={() =>
                    setAlerts((list) => list.filter((x) => x.id !== a.id))
                  }
                >
                  {t("alertOpen")}
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setAlerts((list) => list.filter((x) => x.id !== a.id))
                  }
                >
                  {t("alertClose")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
