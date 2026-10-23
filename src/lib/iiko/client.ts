import "server-only";

// iikoCloud API (api-ru.iiko.services). Ключ apiLogin — у заведения, токен
// живёт час. IIKO_API_BASE подменяют тесты фиктивным сервером.

export class IikoError extends Error {}

export type IikoTable = {
  id: string;
  number: number;
  name: string;
  seatingCapacity: number;
  isDeleted: boolean;
};

export type IikoSection = { id: string; name: string; tables: IikoTable[] };

export type IikoReserveLoad = {
  id: string;
  tableIds: string[];
  estimatedStartTime: string;
  durationInMinutes: number;
};

export type IikoCreateReserve = {
  organizationId: string;
  terminalGroupId: string;
  id: string;
  externalNumber: string;
  tableIds: string[];
  estimatedStartTime: string;
  durationInMinutes: number;
  phone: string;
  customerName: string;
  guestsCount: number | null;
  comment: string | null;
};

export type IikoClient = ReturnType<typeof createIikoClient>;

export function createIikoClient(apiLogin: string) {
  const base = process.env.IIKO_API_BASE || "https://api-ru.iiko.services";
  let token: string | null = null;

  async function post<T>(path: string, body: object, auth = true): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new IikoError("network");
    }
    const json = (await res.json().catch(() => ({}))) as {
      errorDescription?: string;
    } & T;
    if (!res.ok)
      throw new IikoError(json.errorDescription || `http_${res.status}`);
    return json;
  }

  async function call<T>(path: string, body: object): Promise<T> {
    if (!token) {
      const r = await post<{ token: string }>(
        "/api/1/access_token",
        { apiLogin },
        false,
      );
      token = r.token;
    }
    return post<T>(path, body);
  }

  return {
    async organizations() {
      const r = await call<{ organizations: { id: string; name: string }[] }>(
        "/api/1/reserve/available_organizations",
        {},
      );
      return r.organizations;
    },
    async terminalGroups(organizationId: string) {
      const r = await call<{
        terminalGroups: { items: { id: string; name: string }[] }[];
      }>("/api/1/reserve/available_terminal_groups", {
        organizationIds: [organizationId],
      });
      return r.terminalGroups.flatMap((g) => g.items);
    },
    async sections(terminalGroupId: string) {
      const r = await call<{ restaurantSections: IikoSection[] }>(
        "/api/1/reserve/available_restaurant_sections",
        { terminalGroupIds: [terminalGroupId], returnSchema: false },
      );
      return r.restaurantSections;
    },
    async workload(sectionIds: string[], dateFrom: string, dateTo: string) {
      const r = await call<{ reserves: IikoReserveLoad[] }>(
        "/api/1/reserve/restaurant_sections_workload",
        { restaurantSectionIds: sectionIds, dateFrom, dateTo },
      );
      return r.reserves;
    },
    async createReserve(b: IikoCreateReserve) {
      const r = await call<{
        reserveInfo: {
          creationStatus: "Success" | "InProgress" | "Error";
          errorInfo?: { message?: string; description?: string };
        };
      }>("/api/1/reserve/create", {
        organizationId: b.organizationId,
        terminalGroupId: b.terminalGroupId,
        id: b.id,
        externalNumber: b.externalNumber,
        customer: { type: "regular", name: b.customerName },
        phone: b.phone,
        guestsCount: b.guestsCount ?? undefined,
        comment: b.comment ?? undefined,
        durationInMinutes: b.durationInMinutes,
        shouldRemind: true,
        tableIds: b.tableIds,
        estimatedStartTime: b.estimatedStartTime,
      });
      if (r.reserveInfo.creationStatus === "Error") {
        throw new IikoError(
          r.reserveInfo.errorInfo?.description ||
            r.reserveInfo.errorInfo?.message ||
            "creation_error",
        );
      }
    },
    async cancelReserve(
      organizationId: string,
      reserveId: string,
      reason: "ClientNotAppeared" | "ClientRefused" | "Other",
    ) {
      await call("/api/1/reserve/cancel", {
        organizationId,
        reserveId,
        cancelReason: reason,
      });
    },
  };
}
