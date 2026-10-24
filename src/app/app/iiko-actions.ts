"use server";

import { refresh } from "next/cache";
import { createIikoClient, IikoError } from "@/lib/iiko/client";
import { iikoTablesFor } from "@/lib/iiko/tables";
import { isPlatformAdmin } from "@/lib/platform";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Интеграцией с iiko управляет только владелец платформы: при подключении
// заведения и потом в /admin. Владелец заведения видит её состояние.
// Ошибки — ключи из messages (Integration.errors); ошибку iiko показываем
// её текстом (detail).
export type IikoResult<T = object> =
  ({ ok: true } & T) | { ok: false; error: string; detail?: string };

type Option = { id: string; name: string };

export type IikoOptions = {
  organizations: Option[];
  terminalGroups: Option[];
  sections: (Option & { tables: number })[];
};

function iikoFailure(e: unknown): {
  ok: false;
  error: string;
  detail?: string;
} {
  return e instanceof IikoError
    ? { ok: false, error: "iiko", detail: e.message }
    : { ok: false, error: "unknown" };
}

// Клиент iiko по ключу из формы или по сохранённому ключу заведения.
// Ключ service_role — только после проверки владельца платформы.
async function platformIiko(source: { venueId?: string; apiLogin?: string }) {
  if (!(await isPlatformAdmin())) return null;
  let apiLogin = source.apiLogin?.trim() || null;
  if (!apiLogin && source.venueId) {
    const { data } = await createAdminClient().rpc("iiko_api_login", {
      p_venue_id: source.venueId,
    });
    apiLogin = data;
  }
  return { client: apiLogin ? createIikoClient(apiLogin) : null };
}

// Справочники iiko для формы: организации, группы терминалов, залы.
export async function loadIikoOptions(
  source: { venueId?: string; apiLogin?: string },
  organizationId: string | null,
  terminalGroupId: string | null,
): Promise<IikoResult<IikoOptions>> {
  const iiko = await platformIiko(source);
  if (!iiko) return { ok: false, error: "forbidden" };
  if (!iiko.client) return { ok: false, error: "apiLoginRequired" };
  try {
    const organizations = await iiko.client.organizations();
    const terminalGroups = organizationId
      ? await iiko.client.terminalGroups(organizationId)
      : [];
    const sections = terminalGroupId
      ? (await iiko.client.sections(terminalGroupId)).map((s) => ({
          id: s.id,
          name: s.name,
          tables: s.tables.filter((t) => !t.isDeleted).length,
        }))
      : [];
    return {
      ok: true,
      organizations: organizations.map(({ id, name }) => ({ id, name })),
      terminalGroups: terminalGroups.map(({ id, name }) => ({ id, name })),
      sections,
    };
  } catch (e) {
    return iikoFailure(e);
  }
}

// Существующее заведение: новый ключ, выбор залов, загрузка столов и
// включение обмена. Ключ пустой — остаётся сохранённый.
export async function enableIiko(
  venueId: string,
  formData: FormData,
): Promise<IikoResult<{ tables: number }>> {
  const apiLogin = String(formData.get("iikoApiLogin") ?? "").trim();
  const organizationId = String(formData.get("iikoOrganizationId") ?? "");
  const terminalGroupId = String(formData.get("iikoTerminalGroupId") ?? "");
  const sectionIds = formData.getAll("iikoSectionIds").map(String);
  if (!organizationId || !terminalGroupId || sectionIds.length === 0) {
    return { ok: false, error: "settingsIncomplete" };
  }
  if (!(await isPlatformAdmin())) return { ok: false, error: "forbidden" };
  const db = createAdminClient();
  const [{ data: saved }, { data: venue }] = await Promise.all([
    db.rpc("iiko_api_login", { p_venue_id: venueId }),
    db.from("venues").select("type").eq("id", venueId).single(),
  ]);
  const key = apiLogin || saved;
  if (!key) return { ok: false, error: "apiLoginRequired" };
  if (!venue) return { ok: false, error: "unknown" };

  let tables;
  try {
    tables = await iikoTablesFor(key, terminalGroupId, sectionIds, venue.type);
  } catch (e) {
    return iikoFailure(e);
  }
  // Права ещё раз проверяет база: функции только для владельца платформы.
  const supabase = await createClient();
  if (apiLogin) {
    const { error } = await supabase.rpc("set_iiko_api_login", {
      p_venue_id: venueId,
      p_api_login: apiLogin,
    });
    if (error) return { ok: false, error: "unknown" };
  }
  const { error: syncError } = await supabase.rpc("sync_iiko_tables", {
    p_venue_id: venueId,
    p_tables: tables,
  });
  if (syncError) return { ok: false, error: "unknown" };
  const { error } = await supabase.rpc("save_iiko_settings", {
    p_venue_id: venueId,
    p_organization_id: organizationId,
    p_terminal_group_id: terminalGroupId,
    p_section_ids: sectionIds,
    p_enabled: true,
  });
  if (error) return { ok: false, error: "unknown" };
  refresh();
  return { ok: true, tables: tables.length };
}

export async function disableIiko(venueId: string): Promise<IikoResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "forbidden" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("venue_integrations")
    .select("organization_id, terminal_group_id, section_ids")
    .eq("venue_id", venueId)
    .maybeSingle();
  const { error } = await supabase.rpc("save_iiko_settings", {
    p_venue_id: venueId,
    // При выключении пустые id допустимы: типы RPC этого не знают.
    p_organization_id: data?.organization_id as string,
    p_terminal_group_id: data?.terminal_group_id as string,
    p_section_ids: data?.section_ids ?? [],
    p_enabled: false,
  });
  if (error) return { ok: false, error: "unknown" };
  refresh();
  return { ok: true };
}

// Режим «только онлайн-бронь»: без карты сеансов, кассы, смен и отчётов.
export async function setBookingOnly(
  venueId: string,
  on: boolean,
): Promise<IikoResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_venue_booking_only", {
    p_venue_id: venueId,
    p_on: on,
  });
  if (error) return { ok: false, error: "forbidden" };
  refresh();
  return { ok: true };
}
