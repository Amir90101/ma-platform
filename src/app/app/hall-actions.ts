"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { loadHallLayout } from "@/lib/hall/load";
import { getVenueAccess } from "@/lib/venue-access";
import { type Layout, layoutSchema } from "@/lib/validation/hall";

const hallNameSchema = z.string().trim().min(1).max(50);

// Ошибки — ключи из messages (раздел Hall.errors).
// После сохранения возвращаем карту из базы: у новых фигур появились id.
export type SaveLayoutResult =
  { ok: true; layout: Layout } | { ok: false; error: string };

export async function saveHallLayout(
  venueId: string,
  hallId: string,
  hallName: string,
  layout: Layout,
): Promise<SaveLayoutResult> {
  const parsed = layoutSchema.safeParse(layout);
  const name = hallNameSchema.safeParse(hallName);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!name.success) return { ok: false, error: "hallNameRequired" };

  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return { ok: false, error: "forbidden" };
  const { supabase } = access;

  const { error: hallError } = await supabase
    .from("halls")
    .update({ name: name.data })
    .eq("id", hallId)
    .eq("venue_id", venueId);
  if (hallError) return { ok: false, error: "unknown" };

  // Владельца и принадлежность зала ещё раз проверяет сама функция в базе.
  const { error } = await supabase.rpc("save_hall_layout", {
    p_hall_id: hallId,
    p_resources: parsed.data.resources,
    p_objects: parsed.data.objects,
  });
  if (error?.code === "42501") return { ok: false, error: "forbidden" };
  if (error) return { ok: false, error: "unknown" };

  return { ok: true, layout: await loadHallLayout(supabase, hallId) };
}

// Новый зал и сразу переход на его вкладку.
export async function createHall(venueId: string, formData: FormData) {
  const name = hallNameSchema.safeParse(formData.get("name") ?? "");
  if (!name.success) return;
  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return;

  const { count } = await access.supabase
    .from("halls")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venueId);
  const { data } = await access.supabase
    .from("halls")
    .insert({ venue_id: venueId, name: name.data, sort: count ?? 0 })
    .select("id")
    .single();
  if (data) redirect(`/app/${venueId}/settings/hall?hall=${data.id}`);
}
