import type { PostgrestError } from "@supabase/supabase-js";
import type { VenueInput } from "@/lib/validation/venue";

// Ошибки — ключи из messages (раздел Venue.errors).
export type VenueFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  done?: boolean;
};

export function venueRow(v: VenueInput) {
  return {
    type: v.type,
    name: v.name,
    slug: v.slug,
    city: v.city,
    address: v.address,
    phone: v.phone,
    description: v.description,
    working_hours: v.workingHours,
  };
}

// slug уникален во всей базе: чужие заведения не видны через RLS,
// поэтому занятость узнаём по нарушению unique при записи.
export function saveErrorState(error: PostgrestError): VenueFormState {
  if (error.code === "23505") return { fieldErrors: { slug: "slugTaken" } };
  if (error.code === "42501") return { error: "forbidden" };
  return { error: "unknown" };
}
