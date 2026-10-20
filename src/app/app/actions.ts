"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  organizationNameSchema,
  type VenueInput,
  venueFieldErrors,
  venueFromForm,
  venueSchema,
} from "@/lib/validation/venue";

// Ошибки — ключи из messages (раздел Venue.errors).
export type VenueFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  done?: boolean;
};

function venueRow(v: VenueInput) {
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
function saveErrorState(error: PostgrestError): VenueFormState {
  if (error.code === "23505") return { fieldErrors: { slug: "slugTaken" } };
  if (error.code === "42501") return { error: "forbidden" };
  return { error: "unknown" };
}

async function requireUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return { supabase, userId: data.claims.sub };
}

export async function createVenue(
  _prev: VenueFormState,
  formData: FormData,
): Promise<VenueFormState> {
  const { supabase, userId } = await requireUserId();

  // Первое заведение создаёт и организацию; следующие идут в неё же.
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const input = venueFromForm(formData);
  const parsed = venueSchema.safeParse(input);
  const orgName = org
    ? null
    : organizationNameSchema.safeParse(formData.get("orgName") ?? "");

  const fieldErrors = parsed.success
    ? {}
    : venueFieldErrors(parsed.error, input);
  if (orgName && !orgName.success) {
    fieldErrors.orgName = orgName.error.issues[0].message;
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  let orgId = org?.id;
  if (!orgId) {
    const { data, error } = await supabase
      .from("organizations")
      .insert({ name: orgName!.data!, owner_id: userId })
      .select("id")
      .single();
    if (error) return { error: "unknown" };
    orgId = data.id;
  }

  const { data: venue, error } = await supabase
    .from("venues")
    .insert({ org_id: orgId, ...venueRow(parsed.data) })
    .select("id")
    .single();
  if (error) return saveErrorState(error);

  redirect(`/app/${venue.id}/settings`);
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
