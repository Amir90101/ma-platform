"use server";

import { refresh } from "next/cache";
import { loadHallLayout } from "@/lib/hall/load";
import { getVenueAccess } from "@/lib/venue-access";
import { type Layout, layoutSchema } from "@/lib/validation/hall";

// Ошибки — ключи из messages (раздел Hall.errors).
// После сохранения возвращаем карту из базы: у новых фигур появились id.
export type SaveLayoutResult =
  { ok: true; layout: Layout } | { ok: false; error: string };

export async function saveHallLayout(
  venueId: string,
  hallId: string,
  layout: Layout,
): Promise<SaveLayoutResult> {
  const parsed = layoutSchema.safeParse(layout);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return { ok: false, error: "forbidden" };

  // Владельца и принадлежность зала ещё раз проверяет сама функция в базе.
  const { error } = await access.supabase.rpc("save_hall_layout", {
    p_hall_id: hallId,
    p_resources: parsed.data.resources,
    p_objects: parsed.data.objects,
  });
  if (error?.code === "42501") return { ok: false, error: "forbidden" };
  if (error) return { ok: false, error: "unknown" };

  return { ok: true, layout: await loadHallLayout(access.supabase, hallId) };
}

export async function createHall(venueId: string, name: string) {
  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return;
  await access.supabase.from("halls").insert({ venue_id: venueId, name });
  refresh();
}
