import { getTranslations } from "next-intl/server";
import type { WorkingDay } from "@/lib/validation/venue";
import { WEEKDAYS } from "@/lib/validation/venue";
import { isOpenAt } from "@/lib/working-hours";

export type GridSlot = {
  weekday: number;
  minute: number;
  tariff_name: string | null;
  price_per_hour: number | null;
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const CELL_CLASS = {
  tariff: "bg-emerald-200 dark:bg-emerald-800",
  gap: "bg-red-400 dark:bg-red-700",
  closed: "bg-muted",
} as const;

// Неделя по часам: где действует тариф, где рабочее время без тарифа.
// Сами тарифы на каждые полчаса подбирает база (tariff_week_grid).
export async function WeekGrid({
  title,
  slots,
  workingHours,
}: {
  title: string;
  slots: GridSlot[];
  workingHours: WorkingDay[];
}) {
  const t = await getTranslations("Tariffs");
  const tVenue = await getTranslations("Venue");
  const byKey = new Map(slots.map((s) => [`${s.weekday}:${s.minute}`, s]));
  let gaps = 0;

  const rows = WEEKDAYS.map((d) => {
    const day = tVenue(`weekdays.${d}`);
    const cells = HOURS.map((h) => {
      const halves = [h * 60, h * 60 + 30].map((minute) => ({
        open: isOpenAt(workingHours, d, minute),
        slot: byKey.get(`${d}:${minute}`),
      }));
      const time = `${String(h).padStart(2, "0")}:00`;
      const gap = halves.some((x) => x.open && !x.slot?.tariff_name);
      const withTariff = halves.find((x) => x.open && x.slot?.tariff_name);
      if (gap) gaps++;
      const state = gap ? "gap" : withTariff ? "tariff" : "closed";
      const label =
        state === "gap"
          ? t("cellGap", { day, time })
          : state === "tariff"
            ? t("cellTariff", {
                day,
                time,
                name: withTariff!.slot!.tariff_name!,
                price: withTariff!.slot!.price_per_hour!,
              })
            : t("cellClosed", { day, time });
      return { h, state, label };
    });
    return { d, day, cells };
  });

  return (
    <section className="grid gap-2" data-testid="week-grid">
      <h3 className="font-medium">{title}</h3>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th />
              {HOURS.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="text-muted-foreground w-5 font-normal"
                >
                  {h % 3 === 0 ? h : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.d}>
                <th scope="row" className="pr-1 text-left font-medium">
                  {row.day}
                </th>
                {row.cells.map((cell) => (
                  <td
                    key={cell.h}
                    title={cell.label}
                    aria-label={cell.label}
                    data-state={cell.state}
                    className={`h-5 w-5 rounded-sm ${CELL_CLASS[cell.state as keyof typeof CELL_CLASS]}`}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm" data-testid="grid-gaps">
        {gaps ? t("gridGaps", { count: gaps }) : t("gridNoGaps")}
      </p>
    </section>
  );
}
