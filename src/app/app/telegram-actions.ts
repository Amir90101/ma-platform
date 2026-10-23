"use server";

import { refresh } from "next/cache";
import { getVenueAccess } from "@/lib/venue-access";

export type LinkCodeResult =
  { ok: true; code: string } | { ok: false; error: string };

// Код подключения чата: владелец открывает t.me/бот?start=КОД.
export async function createTelegramLinkCode(
  venueId: string,
): Promise<LinkCodeResult> {
  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return { ok: false, error: "forbidden" };
  const { data, error } = await access.supabase.rpc(
    "create_telegram_link_code",
    { p_venue_id: venueId },
  );
  if (error || !data) return { ok: false, error: "unknown" };
  return { ok: true, code: data };
}

export async function disconnectTelegramChat(venueId: string, id: string) {
  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return;
  // RLS даёт удалить только чаты своего заведения.
  await access.supabase.from("telegram_chats").delete().eq("id", id);
  refresh();
}
