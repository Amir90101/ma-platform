"use server";

import { refresh } from "next/cache";
import type { z } from "zod";
import {
  packageFromForm,
  packageSchema,
  tariffFromForm,
  tariffSchema,
} from "@/lib/validation/tariff";
import { getVenueAccess } from "@/lib/venue-access";

// Ошибки — ключи из messages (раздел Tariffs.errors).
export type TariffFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  done?: boolean;
};

function fieldErrors(error: z.ZodError) {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    result[String(issue.path[0] ?? "form")] ??= issue.message;
  }
  return result;
}

async function ownerAccess(venueId: string) {
  const access = await getVenueAccess(venueId);
  return access?.isOwner ? access : null;
}

// id = null — новый тариф.
export async function saveTariff(
  venueId: string,
  id: string | null,
  _prev: TariffFormState,
  formData: FormData,
): Promise<TariffFormState> {
  const parsed = tariffSchema.safeParse(tariffFromForm(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const access = await ownerAccess(venueId);
  if (!access) return { error: "forbidden" };

  const { error } = id
    ? await access.supabase
        .from("tariffs")
        .update(parsed.data)
        .eq("id", id)
        .eq("venue_id", venueId)
    : await access.supabase
        .from("tariffs")
        .insert({ ...parsed.data, venue_id: venueId });
  if (error) return { error: "unknown" };

  refresh();
  return { done: true };
}

export async function deleteTariff(venueId: string, id: string) {
  const access = await ownerAccess(venueId);
  if (!access) return;
  await access.supabase
    .from("tariffs")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);
  refresh();
}

export async function savePackage(
  venueId: string,
  id: string | null,
  _prev: TariffFormState,
  formData: FormData,
): Promise<TariffFormState> {
  const parsed = packageSchema.safeParse(packageFromForm(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const access = await ownerAccess(venueId);
  if (!access) return { error: "forbidden" };

  const { error } = id
    ? await access.supabase
        .from("packages")
        .update(parsed.data)
        .eq("id", id)
        .eq("venue_id", venueId)
    : await access.supabase
        .from("packages")
        .insert({ ...parsed.data, venue_id: venueId });
  if (error) return { error: "unknown" };

  refresh();
  return { done: true };
}

export async function deletePackage(venueId: string, id: string) {
  const access = await ownerAccess(venueId);
  if (!access) return;
  await access.supabase
    .from("packages")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);
  refresh();
}
