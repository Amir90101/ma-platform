"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveErrorState, type VenueFormState, venueRow } from "@/lib/venue-row";
import {
  venueFieldErrors,
  venueFromForm,
  venueSchema,
} from "@/lib/validation/venue";

export type { VenueFormState } from "@/lib/venue-row";

async function requireUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return { supabase, userId: data.claims.sub };
}

export async function updateVenue(
  venueId: string,
  _prev: VenueFormState,
  formData: FormData,
): Promise<VenueFormState> {
  const { supabase } = await requireUserId();

  const input = venueFromForm(formData);
  const parsed = venueSchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: venueFieldErrors(parsed.error, input) };
  }

  // Без прав владельца RLS не даст обновить ни одной строки.
  const { data, error } = await supabase
    .from("venues")
    .update(venueRow(parsed.data))
    .eq("id", venueId)
    .select("id");
  if (error) return saveErrorState(error);
  if (data.length === 0) return { error: "forbidden" };

  refresh();
  return { done: true };
}
