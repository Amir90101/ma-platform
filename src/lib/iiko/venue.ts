import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { addDays, todayIn, zonedToUtc } from "@/lib/venue-time";
import { createIikoClient, type IikoReserveLoad, IikoError } from "./client";
import { freeInIiko, toIikoTime } from "./time";

type Db = SupabaseClient<Database>;

// Включённая интеграция заведения: клиент iiko, залы и столы мест.
// Ключ читает только сервер (service_role): страница гостя работает от anon.
async function loadIiko(venueId: string, db: Db = createAdminClient()) {
  const { data: integration } = await db
    .from("venue_integrations")
    .select("organization_id, terminal_group_id, section_ids, enabled")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (!integration?.enabled) return null;
  const [{ data: apiLogin }, { data: venue }, { data: resources }] =
    await Promise.all([
      db.rpc("iiko_api_login", { p_venue_id: venueId }),
      db
        .from("venues")
        .select("timezone, buffer_min")
        .eq("id", venueId)
        .single(),
      db
        .from("resources")
        .select("id, iiko_table_id")
        .eq("venue_id", venueId)
        .not("iiko_table_id", "is", null),
    ]);
  if (!apiLogin || !venue) return null;
  return {
    client: createIikoClient(apiLogin),
    organizationId: integration.organization_id!,
    terminalGroupId: integration.terminal_group_id!,
    sectionIds: integration.section_ids,
    timezone: venue.timezone,
    bufferMin: venue.buffer_min,
    tableOf: new Map(
      (resources ?? []).map((r) => [r.id, r.iiko_table_id as string]),
    ),
  };
}

// Резервы iiko за рабочий день date (с ночью до следующего утра). Короткий
// кэш: страница гостя перечитывает окна при каждом выборе.
const cache = new Map<string, { at: number; reserves: IikoReserveLoad[] }>();

async function dayReserves(
  iiko: NonNullable<Awaited<ReturnType<typeof loadIiko>>>,
  venueId: string,
  date: string,
) {
  const key = `${venueId}:${date}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.reserves;
  const reserves = await iiko.client.workload(
    iiko.sectionIds,
    toIikoTime(
      zonedToUtc(addDays(date, -1), "00:00", iiko.timezone),
      iiko.timezone,
    ),
    toIikoTime(
      zonedToUtc(addDays(date, 2), "00:00", iiko.timezone),
      iiko.timezone,
    ),
  );
  cache.set(key, { at: Date.now(), reserves });
  return reserves;
}

// Окна get_availability минус занятое в iiko. iiko недоступен — гостю не
// показываем ничего: лучше «нет мест», чем двойная бронь.
export async function filterByIiko<
  T extends { resourceId: string; startsAt: string },
>(
  venueId: string,
  date: string,
  minutes: number,
  slots: T[],
): Promise<T[] | null> {
  const iiko = await loadIiko(venueId);
  if (!iiko) return slots;
  let reserves: IikoReserveLoad[];
  try {
    reserves = await dayReserves(iiko, venueId, date);
  } catch {
    return null;
  }
  return slots.filter((s) => {
    const table = iiko.tableOf.get(s.resourceId);
    return (
      !table ||
      freeInIiko(
        reserves,
        table,
        new Date(s.startsAt),
        minutes,
        iiko.bufferMin,
        iiko.timezone,
      )
    );
  });
}

// Проверка прямо перед созданием брони: не заняли ли стол в iiko.
export async function freeInIikoNow(
  venueId: string,
  resourceId: string,
  startsAt: Date,
  minutes: number,
): Promise<boolean> {
  const iiko = await loadIiko(venueId);
  if (!iiko) return true;
  const table = iiko.tableOf.get(resourceId);
  if (!table) return true;
  const date = todayIn(iiko.timezone, startsAt);
  cache.delete(`${venueId}:${date}`);
  try {
    const reserves = await dayReserves(iiko, venueId, date);
    return freeInIiko(
      reserves,
      table,
      startsAt,
      minutes,
      iiko.bufferMin,
      iiko.timezone,
    );
  } catch {
    return false;
  }
}

// Очередь integration_outbox: новые брони — reserve/create, отмены и
// неявки — reserve/cancel. Неудача остаётся в очереди (до 10 попыток).
export async function dispatchIiko(db: Db) {
  const { data: rows } = await db.rpc("iiko_claim_outbox", { p_limit: 20 });
  let done = 0;
  for (const row of rows ?? []) {
    const { data: b } = await db
      .from("bookings")
      .select(
        "id, resource_id, starts_at, ends_at, status, guests, comment, cancelled_by_guest, customers(name, phone)",
      )
      .eq("id", row.booking_id)
      .single();
    const iiko = b ? await loadIiko(row.venue_id, db) : null;
    const table = b ? iiko?.tableOf.get(b.resource_id) : undefined;
    let error: string | null = null;
    if (b && iiko && table) {
      try {
        if (row.action === "create") {
          await iiko.client.createReserve({
            organizationId: iiko.organizationId,
            terminalGroupId: iiko.terminalGroupId,
            id: b.id,
            externalNumber: b.id.slice(0, 8).toUpperCase(),
            tableIds: [table],
            estimatedStartTime: toIikoTime(
              new Date(b.starts_at),
              iiko.timezone,
            ),
            durationInMinutes: Math.round(
              (Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60_000,
            ),
            phone: b.customers?.phone ?? "",
            customerName: b.customers?.name || b.customers?.phone || "Гость",
            guestsCount: b.guests,
            comment: b.comment,
          });
        } else {
          await iiko.client.cancelReserve(
            iiko.organizationId,
            b.id,
            b.status === "no_show"
              ? "ClientNotAppeared"
              : b.cancelled_by_guest
                ? "ClientRefused"
                : "Other",
          );
        }
      } catch (e) {
        error = e instanceof IikoError ? e.message : "unknown";
      }
    }
    // Интеграцию выключили или стол не связан — отправлять нечего.
    const skipped = !b || !iiko || !table;
    if (b && !skipped) {
      await db
        .from("bookings")
        .update({
          iiko_status: error
            ? "error"
            : row.action === "create"
              ? "sent"
              : "cancelled",
          iiko_error: error,
        })
        .eq("id", b.id);
    }
    if (!error) {
      await db
        .from("integration_outbox")
        .update({ done_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      done++;
    } else {
      await db
        .from("integration_outbox")
        .update({ last_error: error })
        .eq("id", row.id);
    }
  }
  return { done };
}
