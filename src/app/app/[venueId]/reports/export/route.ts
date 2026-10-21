import { getTranslations } from "next-intl/server";
import { toCsv, type CsvCell } from "@/lib/csv";
import {
  type LoadReport,
  PAYMENT_METHODS,
  type RevenueReport,
} from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { isDateString } from "@/lib/venue-time";

const KINDS = ["revenue-days", "revenue-resources", "load"] as const;
type Kind = (typeof KINDS)[number];

// Выгрузка отчёта в CSV. Права проверяют сами RPC отчётов (владелец).
export async function GET(
  request: Request,
  { params }: RouteContext<"/app/[venueId]/reports/export">,
) {
  const { venueId } = await params;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") as Kind;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!KINDS.includes(kind) || !isDateString(from) || !isDateString(to)) {
    return new Response("Bad request", { status: 400 });
  }
  const period = { from, to };
  const t = await getTranslations("Reports");
  const supabase = await createClient();
  const args = { p_venue_id: venueId, p_from: period.from, p_to: period.to };

  let header: string[];
  let rows: CsvCell[][];
  if (kind === "load") {
    const { data, error } = await supabase.rpc("get_load_report", args);
    if (error) return new Response("Not found", { status: 404 });
    const load = data as LoadReport;
    header = [t("resource"), t("csvBusyMinutes"), t("csvPercent")];
    rows = load.resources.map((r) => [r.name, r.busy_minutes, r.percent]);
  } else {
    const { data, error } = await supabase.rpc("get_revenue_report", args);
    if (error) return new Response("Not found", { status: 404 });
    const revenue = data as RevenueReport;
    if (kind === "revenue-days") {
      header = [
        t("day"),
        ...PAYMENT_METHODS.map((m) => t(`methods.${m}`)),
        t("total"),
      ];
      rows = revenue.by_day.map((d) => [
        d.day,
        ...PAYMENT_METHODS.map((m) => d[m]),
        d.total,
      ]);
      rows.push([
        t("total"),
        ...PAYMENT_METHODS.map((m) => revenue.by_method[m]),
        revenue.total,
      ]);
    } else {
      header = [t("resource"), t("sessions"), t("total")];
      rows = revenue.by_resource.map((r) => [r.name, r.sessions, r.total]);
    }
  }

  const filename = `${kind}_${period.from}_${period.to}.csv`;
  return new Response(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
