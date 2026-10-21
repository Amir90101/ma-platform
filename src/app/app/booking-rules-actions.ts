"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  bookingRulesFromForm,
  bookingRulesSchema,
} from "@/lib/validation/booking-rules";

// Ошибки — ключи из messages (раздел BookingRules.errors).
export type BookingRulesState = {
  fieldErrors?: Record<string, string>;
  error?: string;
  done?: boolean;
};

// Правила брони заведения. Писать в venues может только владелец (RLS).
export async function updateBookingRules(
  venueId: string,
  _prev: BookingRulesState,
  formData: FormData,
): Promise<BookingRulesState> {
  const parsed = bookingRulesSchema.safeParse(bookingRulesFromForm(formData));
  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
      ),
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("venues")
    .update(parsed.data)
    .eq("id", venueId)
    .select("id");
  if (error) return { error: "unknown" };
  if (data.length === 0) return { error: "forbidden" };
  refresh();
  return { done: true };
}

// Публикация страницы /{slug}. Без активных мест публиковать нечего.
export async function setPublished(
  venueId: string,
  published: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  if (published) {
    const { count } = await supabase
      .from("resources")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .eq("is_active", true);
    if (!count) return { ok: false, error: "noResources" };
  }
  const { data, error } = await supabase
    .from("venues")
    .update({ is_published: published })
    .eq("id", venueId)
    .select("id");
  if (error) return { ok: false, error: "unknown" };
  if (data.length === 0) return { ok: false, error: "forbidden" };
  refresh();
  return { ok: true };
}
