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
  "item_invalid",
  "item_not_found",
  "payments_mismatch",
  "shift_not_open",
  "shift_already_open",
  "shift_already_closed",
  "cash_invalid",
  "overpayment",
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

export type Receipt = {
  lines: {
    tariff_id: string;
    name: string;
    price_per_hour: number;
    minutes: number;
    amount: number;
  }[];
  package: { name: string; minutes: number; price: number } | null;
  minutes: number;
  time_amount: number;
  items: { id: string; name: string; price: number; qty: number }[];
  items_amount: number;
  // Сумма без скидки: скидку вводят в чеке.
  subtotal: number;
};

// Чек для закрытия: всё считает база (calc_session_amount).
export async function getReceipt(
  sessionId: string,
): Promise<{ ok: true; receipt: Receipt } | { ok: false; error: string }> {
  const supabase = await createClient();
  const [{ data, error }, { data: items }] = await Promise.all([
    supabase.rpc("calc_session_amount", { p_session_id: sessionId }),
    supabase
      .from("session_items")
      .select("id, name, price, qty")
      .eq("session_id", sessionId)
      .order("created_at"),
  ]);
  if (error) {
    return {
      ok: false,
      error: KNOWN_ERRORS.has(error.message) ? error.message : "unknown",
    };
  }
  const calc = data as Omit<Receipt, "items" | "subtotal">;
  return {
    ok: true,
    receipt: {
      lines: calc.lines,
      package: calc.package,
      minutes: calc.minutes,
      time_amount: calc.time_amount,
      items_amount: calc.items_amount,
      items: items ?? [],
      subtotal: calc.time_amount + calc.items_amount,
    },
  };
}

export async function addSessionItem(sessionId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_session_item", {
    p_session_id: sessionId,
    p_name: String(formData.get("name") ?? ""),
    p_price: Number(formData.get("price") || -1),
    p_qty: Number(formData.get("qty") || 1),
  });
  return result(error);
}

export async function removeSessionItem(itemId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_session_item", {
    p_item_id: itemId,
  });
  return result(error);
}

export async function checkoutSession(
  sessionId: string,
  discount: number,
  payments: { method: "cash" | "kaspi" | "card"; amount: number }[],
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("checkout_session", {
    p_session_id: sessionId,
    p_discount_amount: discount,
    p_payments: payments,
  });
  return result(error);
}

export async function openShift(venueId: string, formData: FormData) {
  const cash = String(formData.get("cash") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_shift", {
    p_venue_id: venueId,
    p_opening_cash: /^\d+$/.test(cash) ? Number(cash) : -1,
  });
  return result(error);
}

export type CloseShiftResult =
  | { ok: true; expected: number; counted: number }
  | { ok: false; error: string };

export async function closeShift(
  shiftId: string,
  formData: FormData,
): Promise<CloseShiftResult> {
  const r = await closeShiftNow(shiftId, formData);
  if (r.ok) refresh();
  return r;
}

// Конец смены сотрудника перед выходом: страницу не перерисовываем, иначе
// каркас увидит, что смены нет, и вместо итога покажет «Начало смены».
export async function endShift(
  shiftId: string,
  formData: FormData,
): Promise<CloseShiftResult> {
  return closeShiftNow(shiftId, formData);
}

async function closeShiftNow(
  shiftId: string,
  formData: FormData,
): Promise<CloseShiftResult> {
  const cash = String(formData.get("cash") ?? "").trim();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_shift", {
    p_shift_id: shiftId,
    p_closing_cash: /^\d+$/.test(cash) ? Number(cash) : -1,
  });
  if (error) {
    return {
      ok: false,
      error: KNOWN_ERRORS.has(error.message) ? error.message : "unknown",
    };
  }
  return {
    ok: true,
    expected: data.expected_cash ?? 0,
    counted: data.closing_cash ?? 0,
  };
}
