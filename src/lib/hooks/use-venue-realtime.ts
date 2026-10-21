"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type RealtimeTable =
  "session_segments" | "sessions" | "shifts" | "bookings";

// Изменения таблиц заведения во всех открытых окнах: строки приходят из
// Supabase Realtime (RLS пускает только участников), и страница
// перечитывает данные с сервера.
export function useVenueRealtime(
  venueId: string,
  tables: readonly RealtimeTable[],
): "connecting" | "on" {
  const router = useRouter();
  const [state, setState] = useState<"connecting" | "on">("connecting");
  const key = tables.join(",");
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;
    // Одно действие меняет несколько строк: собираем их в одну перерисовку.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };
    const filter = `venue_id=eq.${venueId}`;

    // Сессия из cookie не вызывает событие входа, и Realtime остался бы
    // с anon-ключом: RLS не отдал бы изменения. Передаём токен явно.
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session) {
        await supabase.realtime.setAuth(data.session.access_token);
      }
      channel = supabase.channel(`venue-${venueId}-${key}`);
      for (const table of key.split(",")) {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter },
          refresh,
        );
      }
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") setState("on");
      });
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [venueId, key, router]);
  return state;
}
