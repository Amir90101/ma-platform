"use server";

import { refresh } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

const KNOWN_ERRORS = new Set([
  "booking_not_found",
  "booking_not_confirmed",
  "cancel_too_late",
]);

// Отмена гостем по личной ссылке: только до начала брони (проверяет база).
export async function cancelByToken(
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createPublicClient().rpc("cancel_booking_by_token", {
    p_token: token,
  });
  if (error) {
    return {
      ok: false,
      error: KNOWN_ERRORS.has(error.message) ? error.message : "unknown",
    };
  }
  refresh();
  return { ok: true };
}
