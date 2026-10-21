import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type UpcomingBooking = {
  id: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
  guest: string | null;
  guests: number | null;
  noShowCount: number;
  packageName: string | null;
};

// Ближайшие 12 часов ждущих броней: предупреждение при старте стола и
// кнопка «Пришёл» на карте. Уже начавшиеся брони, где гость опаздывает,
// тоже здесь, пока бронь не закончилась.
const HORIZON_MS = 12 * 60 * 60 * 1000;

export async function loadUpcomingBookings(
  supabase: SupabaseClient<Database>,
  venueId: string,
): Promise<UpcomingBooking[]> {
  const now = Date.now();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, resource_id, starts_at, ends_at, guests, customer_id, customers(name, phone), packages(name)",
    )
    .eq("venue_id", venueId)
    .eq("status", "confirmed")
    .gt("ends_at", new Date(now).toISOString())
    .lt("starts_at", new Date(now + HORIZON_MS).toISOString())
    .order("starts_at");
  const bookings = data ?? [];

  const noShows = new Map<string, number>();
  if (bookings.length) {
    const { data: missed } = await supabase
      .from("bookings")
      .select("customer_id")
      .eq("venue_id", venueId)
      .eq("status", "no_show")
      .in("customer_id", [...new Set(bookings.map((b) => b.customer_id))]);
    for (const m of missed ?? []) {
      noShows.set(m.customer_id, (noShows.get(m.customer_id) ?? 0) + 1);
    }
  }

  return bookings.map((b) => ({
    id: b.id,
    resourceId: b.resource_id,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    guest:
      [b.customers?.name, b.customers?.phone].filter(Boolean).join(", ") ||
      null,
    guests: b.guests,
    noShowCount: noShows.get(b.customer_id) ?? 0,
    packageName: b.packages?.name ?? null,
  }));
}
