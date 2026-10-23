import { describe, expect, it } from "vitest";
import {
  isAllDay,
  workingDaySchema,
  workingHoursFromForm,
} from "@/lib/validation/venue";
import { isOpenAt } from "@/lib/working-hours";

describe("круглосуточная работа", () => {
  it("00:00–00:00 — круглосуточно, другие равные часы — ошибка", () => {
    const allDay = { weekday: 1, open: "00:00", close: "00:00" };
    expect(workingDaySchema.safeParse(allDay).success).toBe(true);
    expect(isAllDay(allDay)).toBe(true);
    expect(
      workingDaySchema.safeParse({ weekday: 1, open: "10:00", close: "10:00" })
        .success,
    ).toBe(false);
  });

  it("галочка дня даёт 00:00–00:00, выходной в часы не попадает", () => {
    const fd = new FormData();
    fd.append("hours.1.allDay", "on");
    fd.append("hours.1.open", "10:00");
    fd.append("hours.1.close", "22:00");
    fd.append("hours.2.open", "10:00");
    fd.append("hours.2.close", "22:00");
    for (const d of [3, 4, 5, 6, 7]) fd.append(`hours.${d}.closed`, "on");
    expect(workingHoursFromForm(fd)).toEqual([
      { weekday: 1, open: "00:00", close: "00:00" },
      { weekday: 2, open: "10:00", close: "22:00" },
    ]);
  });

  it("открыто в любую минуту суток", () => {
    const hours = [{ weekday: 1, open: "00:00", close: "00:00" }];
    for (const minute of [0, 1, 12 * 60, 23 * 60 + 59]) {
      expect(isOpenAt(hours, 1, minute)).toBe(true);
    }
    expect(isOpenAt(hours, 2, 0)).toBe(false);
  });
});
