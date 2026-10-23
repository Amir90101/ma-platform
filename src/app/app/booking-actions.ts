"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { dispatchIiko, freeInIikoNow } from "@/lib/iiko/venue";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  manualBookingFromForm,
  manualBookingSchema,
} from "@/lib/validation/booking";
import type { WorkingDay } from "@/lib/validation/venue";
import { bookingRange, isDateString } from "@/lib/venue-time";

// Ошибки — ключи из messages (раздел Bookings.errors). Бизнес-ошибки
// приходят из RPC текстом: booking_overlap, booking_in_past и т. п.
export type BookingConflict = {
  customerName: string | null;
  startsAt: string;
  endsAt: string;
};
export type BookingActionResult =
  { ok: true } | { ok: false; error: string; conflict?: BookingConflict };

const KNOWN_ERRORS = new Set([
  "booking_overlap",
  "booking_in_past",
  "booking_time_invalid",
  "booking_not_found",
  "booking_not_confirmed",
  "booking_status_invalid",
  "booking_ended",
  "resource_busy",
  "package_not_found",
  "phone_required",
  "reason_required",
  "resource_not_found",
  "resource_inactive",
]);

function failure(error: PostgrestError): BookingActionResult {
  if (!KNOWN_ERRORS.has(error.message)) return { ok: false, error: "unknown" };
  if (error.message !== "booking_overlap") {
    return { ok: false, error: error.message };
  }
  // Мешающую бронь база кладёт в detail ошибки.
  try {
    const c = JSON.parse(error.details) as {
      customer_name: string | null;
      starts_at: string;
      ends_at: string;
    };
    return {
      ok: false,
      error: error.message,
      conflict: c.starts_at
        ? {
            customerName: c.customer_name,
            startsAt: c.starts_at,
            endsAt: c.ends_at,
          }
        : undefined,
    };
  } catch {
    return { ok: false, error: error.message };
  }
}

// Бронь по звонку на ленте дня date: время — местное время заведения.
export async function createManualBooking(
  venueId: string,
  date: string,
  formData: FormData,
): Promise<BookingActionResult> {
  const parsed = manualBookingSchema.safeParse(manualBookingFromForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  if (!isDateString(date)) return { ok: false, error: "unknown" };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: venue } = await supabase
    .from("venues")
    .select("timezone, working_hours")
    .eq("id", venueId)
    .single();
  if (!venue) return { ok: false, error: "unknown" };
  const { startsAt, endsAt } = bookingRange(
    date,
    v.start,
    v.end,
    venue.working_hours as WorkingDay[],
    venue.timezone,
  );

  // С тарифом конец брони — начало плюс минуты тарифа.
  let ends = endsAt;
  if (v.package_id) {
    const { data: pkg } = await supabase
      .from("packages")
      .select("minutes")
      .eq("id", v.package_id)
      .single();
    if (!pkg) return { ok: false, error: "package_not_found" };
    ends = new Date(startsAt.getTime() + pkg.minutes * 60_000);
  }

  // Заведение с iiko: стол может быть занят бронью в кассе (этап 9.5).
  if (
    !(await freeInIikoNow(
      venueId,
      v.resource_id,
      startsAt,
      Math.round((ends.getTime() - startsAt.getTime()) / 60_000),
    ))
  ) {
    return { ok: false, error: "iiko_busy" };
  }

  const { error } = await supabase.rpc("create_manual_booking", {
    p_resource_id: v.resource_id,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: ends.toISOString(),
    p_package_id: v.package_id || undefined,
    p_customer_phone: v.phone,
    p_customer_name: v.name || undefined,
    p_guests: v.guests ?? undefined,
    p_comment: v.comment || undefined,
  });
  if (error) return failure(error);
  after(() => dispatchIiko(createAdminClient()));
  refresh();
  return { ok: true };
}

export async function cancelBooking(
  bookingId: string,
  reason: string,
): Promise<BookingActionResult> {
  if (!reason.trim()) return { ok: false, error: "reason_required" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_booking_status", {
    p_booking_id: bookingId,
    p_status: "cancelled",
    p_reason: reason.trim(),
  });
  if (error) return failure(error);
  refresh();
  return { ok: true };
}

export async function markNoShow(
  bookingId: string,
): Promise<BookingActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_booking_status", {
    p_booking_id: bookingId,
    p_status: "no_show",
  });
  if (error) return failure(error);
  refresh();
  return { ok: true };
}

// «Пришёл»: бронь становится сеансом на своём столе.
export async function arriveBooking(
  bookingId: string,
): Promise<BookingActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("arrive_booking", {
    p_booking_id: bookingId,
  });
  if (error) return failure(error);
  refresh();
  return { ok: true };
}
