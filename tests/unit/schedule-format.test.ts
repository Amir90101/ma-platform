import { describe, expect, it } from "vitest";
import { formatWeekdays, hhmm } from "@/lib/schedule-format";

const LABELS = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  7: "Вс",
};

describe("formatWeekdays", () => {
  it("сворачивает подряд идущие дни в диапазон", () => {
    expect(formatWeekdays([1, 2, 3, 4, 5], LABELS)).toBe("Пн–Пт");
    expect(formatWeekdays([1, 2, 3, 4, 5, 6, 7], LABELS)).toBe("Пн–Вс");
  });

  it("два соседних дня — через запятую, одиночные — отдельно", () => {
    expect(formatWeekdays([6, 7], LABELS)).toBe("Сб, Вс");
    expect(formatWeekdays([7, 1, 3, 4, 5], LABELS)).toBe("Пн, Ср–Пт, Вс");
  });
});

describe("hhmm", () => {
  it("отбрасывает секунды", () => {
    expect(hhmm("10:00:00")).toBe("10:00");
    expect(hhmm("02:30")).toBe("02:30");
  });
});
