"use server";

import { refresh } from "next/cache";
import { createIikoClient, IikoError } from "@/lib/iiko/client";
import { iikoTableLayout } from "@/lib/iiko/layout";
import { createAdminClient } from "@/lib/supabase/admin";
import { resourceKindsFor } from "@/lib/venue-types";
import { getVenueAccess } from "@/lib/venue-access";

// Ошибки — ключи из messages (Integration.errors); ошибку iiko показываем
// её текстом (detail).
export type IikoResult<T = object> =
  ({ ok: true } & T) | { ok: false; error: string; detail?: string };

type Option = { id: string; name: string };

async function ownerIiko(venueId: string) {
  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return null;
  // Ключ service_role — только после проверки, что зовёт владелец.
  const { data: apiLogin } = await createAdminClient().rpc("iiko_api_login", {
    p_venue_id: venueId,
  });
  return { access, client: apiLogin ? createIikoClient(apiLogin) : null };
}

function iikoFailure(e: unknown): {
  ok: false;
  error: string;
  detail?: string;
} {
  return e instanceof IikoError
    ? { ok: false, error: "iiko", detail: e.message }
    : { ok: false, error: "unknown" };
}

export async function saveIikoKey(
  venueId: string,
  formData: FormData,
): Promise<IikoResult<{ organizations: Option[] }>> {
  const apiLogin = String(formData.get("apiLogin") ?? "").trim();
  if (!apiLogin) return { ok: false, error: "apiLoginRequired" };
  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return { ok: false, error: "forbidden" };
  // Сначала проверяем ключ в iiko, потом сохраняем.
  let organizations: Option[];
  try {
    organizations = await createIikoClient(apiLogin).organizations();
  } catch (e) {
    return iikoFailure(e);
  }
  const { error } = await access.supabase.rpc("set_iiko_api_login", {
    p_venue_id: venueId,
    p_api_login: apiLogin,
  });
  if (error) return { ok: false, error: "unknown" };
  refresh();
  return { ok: true, organizations };
}

// Справочники iiko для формы: организации, группы терминалов, залы.
export async function loadIikoOptions(
  venueId: string,
  organizationId: string | null,
  terminalGroupId: string | null,
): Promise<
  IikoResult<{
    organizations: Option[];
    terminalGroups: Option[];
    sections: (Option & { tables: number })[];
  }>
> {
  const iiko = await ownerIiko(venueId);
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

// Сохранить выбор, загрузить столы выбранных залов и включить обмен.
export async function enableIiko(
  venueId: string,
  formData: FormData,
): Promise<IikoResult<{ tables: number }>> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const terminalGroupId = String(formData.get("terminalGroupId") ?? "");
  const sectionIds = formData.getAll("sectionIds").map(String);
  if (!organizationId || !terminalGroupId || sectionIds.length === 0) {
    return { ok: false, error: "settingsIncomplete" };
  }
  const iiko = await ownerIiko(venueId);
  if (!iiko) return { ok: false, error: "forbidden" };
  if (!iiko.client) return { ok: false, error: "apiLoginRequired" };
  const { supabase, venue } = iiko.access;

  let tables;
  try {
    tables = (await iiko.client.sections(terminalGroupId))
      .filter((s) => sectionIds.includes(s.id))
      .flatMap((s) => s.tables)
      .filter((t) => !t.isDeleted);
  } catch (e) {
    return iikoFailure(e);
  }
  const { error: syncError } = await supabase.rpc("sync_iiko_tables", {
    p_venue_id: venueId,
    p_tables: iikoTableLayout(tables, resourceKindsFor(venue.type)[0]),
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
  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return { ok: false, error: "forbidden" };
  const { data } = await access.supabase
    .from("venue_integrations")
    .select("organization_id, terminal_group_id, section_ids")
    .eq("venue_id", venueId)
    .maybeSingle();
  const { error } = await access.supabase.rpc("save_iiko_settings", {
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
  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return { ok: false, error: "forbidden" };
  const { data, error } = await access.supabase
    .from("venues")
    .update({ booking_only: on })
    .eq("id", venueId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "unknown" };
  refresh();
  return { ok: true };
}
