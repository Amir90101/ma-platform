import "server-only";
import { createClient } from "@/lib/supabase/server";

// Заведение и роль текущего пользователя в нём. null — заведения нет
// или пользователь не состоит в его организации (RLS не отдаёт строку).
export async function getVenueAccess(venueId: string) {
  const supabase = await createClient();
  const { data: venue } = await supabase
    .from("venues")
    .select("id, org_id, name")
    .eq("id", venueId)
    .maybeSingle();
  if (!venue) return null;

  const { data: isOwner } = await supabase.rpc("is_org_owner", {
    p_org_id: venue.org_id,
  });
  return { supabase, venue, isOwner: isOwner === true };
}
