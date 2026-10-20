import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Layout } from "@/lib/validation/hall";

// Карта зала в том виде, в каком её правит редактор и принимает save_hall_layout.
export async function loadHallLayout(
  supabase: SupabaseClient<Database>,
  hallId: string,
): Promise<Layout> {
  const [{ data: resources }, { data: objects }] = await Promise.all([
    supabase
      .from("resources")
      .select(
        "id, kind, name, capacity, x, y, w, h, rotation, shape, bookable_online, is_active",
      )
      .eq("hall_id", hallId)
      .order("created_at"),
    supabase
      .from("hall_objects")
      .select("id, kind, label, x, y, w, h, rotation")
      .eq("hall_id", hallId)
      .order("created_at"),
  ]);
  return {
    resources: (resources ?? []).map((r) => ({
      ...r,
      shape: r.shape === "circle" ? "circle" : "rect",
    })),
    objects: objects ?? [],
  };
}
