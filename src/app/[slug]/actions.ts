"use server";

import { createPublicClient } from "@/lib/supabase/public";
import { isDateString } from "@/lib/venue-time";

export type PublicSlot = { resourceId: string; startsAt: string };

// Свободные окна для публичной страницы: только get_availability от anon.
export async function getPublicAvailability(
  venueId: string,
  date: string,
  durationMin: number,
): Promise<{ ok: true; slots: PublicSlot[] } | { ok: false }> {
  if (!isDateString(date) || !Number.isInteger(durationMin)) {
    return { ok: false };
  }
  const { data, error } = await createPublicClient().rpc("get_availability", {
    p_venue_id: venueId,
    p_date: date,
    p_duration_min: durationMin,
  });
  if (error) return { ok: false };
  return {
    ok: true,
    slots: (data ?? []).map((s) => ({
      resourceId: s.resource_id,
      startsAt: s.starts_at,
    })),
  };
}
