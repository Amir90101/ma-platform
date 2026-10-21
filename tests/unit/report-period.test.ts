import { describe, expect, it } from "vitest";
import { periodPresets, reportPeriod } from "@/lib/report-period";

describe("report period", () => {
  it("по умолчанию — с начала месяца по сегодня", () => {
    expect(reportPeriod("2026-10-21", undefined, "garbage")).toEqual({
      from: "2026-10-01",
      to: "2026-10-21",
    });
  });

  it("берёт даты из адреса", () => {
    expect(reportPeriod("2026-10-21", "2026-09-01", "2026-09-30")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("быстрые периоды, прошлый месяц через границу года", () => {
    const p = periodPresets("2026-01-15");
    expect(p.week).toEqual({ from: "2026-01-09", to: "2026-01-15" });
    expect(p.prevMonth).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});
