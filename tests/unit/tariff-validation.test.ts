import { describe, expect, it } from "vitest";
import {
  packageFromForm,
  packageSchema,
  tariffFromForm,
  tariffSchema,
} from "@/lib/validation/tariff";
import { isOpenAt } from "@/lib/working-hours";

function form(fields: [string, string][]) {
  const fd = new FormData();
  for (const [k, v] of fields) fd.append(k, v);
  return fd;
}

describe("tariffSchema", () => {
  it("ночной тариф 22:00–06:00 принимается как есть", () => {
    const r = tariffSchema.parse(
      tariffFromForm(
        form([
          ["name", "Ночь"],
          ["resource_kinds", "pool_table"],
          ["price_per_hour", "2000"],
          ["weekdays", "5"],
          ["weekdays", "6"],
          ["time_from", "22:00"],
          ["time_to", "06:00"],
          ["is_active", "on"],
        ]),
      ),
    );
    expect(r).toMatchObject({
      time_from: "22:00",
      time_to: "06:00",
      weekdays: [5, 6],
      price_per_hour: 2000,
      priority: 0,
      is_active: true,
    });
  });

  it("требует виды ресурсов, дни недели и целую цену", () => {
    const r = tariffSchema.safeParse(
      tariffFromForm(
        form([
          ["name", "X"],
          ["price_per_hour", "1500.5"],
          ["time_from", "10:00"],
          ["time_to", "18:00"],
        ]),
      ),
    );
    expect(r.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
      ["resource_kinds", "kindsRequired"],
      ["price_per_hour", "priceFormat"],
      ["weekdays", "weekdaysRequired"],
    ]);
  });
});

describe("пустые числа", () => {
  it("пустая цена — ошибка, а не 0 ₸", () => {
    const r = tariffSchema.safeParse(
      tariffFromForm(
        form([
          ["name", "X"],
          ["resource_kinds", "pool_table"],
          ["weekdays", "1"],
          ["price_per_hour", ""],
          ["time_from", "10:00"],
          ["time_to", "18:00"],
        ]),
      ),
    );
    expect(r.error?.issues.map((i) => i.message)).toEqual(["priceFormat"]);
  });
});

describe("packageSchema", () => {
  it("пакет 180 минут за 5 000", () => {
    expect(
      packageSchema.parse(
        packageFromForm(
          form([
            ["name", "3 часа за 5 000"],
            ["resource_kinds", "pool_table"],
            ["minutes", "180"],
            ["price", "5000"],
            ["is_active", "on"],
          ]),
        ),
      ),
    ).toMatchObject({ minutes: 180, price: 5000 });
  });
});

describe("isOpenAt", () => {
  const hours = [
    { weekday: 1, open: "10:00", close: "02:00" },
    { weekday: 2, open: "12:00", close: "20:00" },
  ];
  it.each([
    [1, 9 * 60, false],
    [1, 10 * 60, true],
    [2, 60, true], // ночь понедельника
    [2, 2 * 60, false],
    [2, 19 * 60 + 30, true],
    [2, 20 * 60, false],
    [3, 60, false],
  ])("день %s минута %s → %s", (weekday, minute, open) => {
    expect(isOpenAt(hours, weekday, minute)).toBe(open);
  });
});
