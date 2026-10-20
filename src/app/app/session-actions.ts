"use server";

import { refresh } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";
import { normalizeKzPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

// Ошибки — ключи из messages (раздел Work.errors). Бизнес-ошибки приходят
// из RPC текстом: resource_busy, no_tariff и т. п.
export type SessionActionResult = { ok: true } | { ok: false; error: string };

const KNOWN_ERRORS = new Set([
  "resource_busy",
  "resource_inactive",
  "resource_not_found",
  "expected_end_in_past",
  "package_not_found",
  "session_not_found",
  "session_not_active",
  "session_not_paused",
  "session_not_open",
  "same_resource",
  "no_tariff",
  "discount_too_big",
  "discount_invalid",
]);

function result(error: PostgrestError | null): SessionActionResult {
  if (!error) {
    refresh();
    return { ok: true };
  }
  return {
    ok: false,
    error: KNOWN_ERRORS.has(error.message) ? error.message : "unknown",
  };
}

export async function startSession(
  resourceId: string,
  formData: FormData,
): Promise<SessionActionResult> {
  const phoneInput = String(formData.get("phone") ?? "").trim();
  const phone = phoneInput ? normalizeKzPhone(phoneInput) : null;
  if (phoneInput && !phone) return { ok: false, error: "phoneFormat" };
  const minutes = Number(formData.get("duration") || 0);
  const packageId = String(formData.get("package") ?? "") || undefined;

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_session", {
    p_resource_id: resourceId,
    p_expected_end_at:
      minutes > 0
        ? new Date(Date.now() + minutes * 60_000).toISOString()
        : undefined,
    p_package_id: packageId,
    p_customer_phone: phone ?? undefined,
    p_customer_name: String(formData.get("name") ?? "").trim() || undefined,
  });
  return result(error);
}

export async function pauseSession(sessionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("pause_session", {
    p_session_id: sessionId,
  });
  return result(error);
}

export async function resumeSession(sessionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resume_session", {
    p_session_id: sessionId,
  });
  return result(error);
}

export async function transferSession(sessionId: string, resourceId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_session", {
    p_session_id: sessionId,
    p_resource_id: resourceId,
  });
  return result(error);
}

export async function closeSession(sessionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_session", {
    p_session_id: sessionId,
  });
  return result(error);
}
