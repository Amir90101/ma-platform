import { describe, expect, it } from "vitest";
import {
  clampToHall,
  freeSpot,
  nextName,
  normalizeRotation,
  snap,
} from "@/lib/hall/geometry";
import { layoutSchema } from "@/lib/validation/hall";

const hall = { width: 1200, height: 800 };

describe("геометрия карты", () => {
  it("привязка к сетке 10", () => {
    expect(snap(104)).toBe(100);
    expect(snap(105)).toBe(110);
    expect(snap(-3)).toBe(-0);
  });

  it.each([
    [0, 0],
    [90.4, 90],
    [-90, 270],
    [360, 0],
    [725, 5],
  ])("поворот %s → %s", (input, expected) => {
    expect(normalizeRotation(input)).toBe(expected);
  });

  it("фигура не выходит за зал и не меньше 20", () => {
    expect(clampToHall({ x: 1150, y: -50, w: 180, h: 5 }, hall)).toEqual({
      x: 1020,
      y: 0,
      w: 180,
      h: 20,
    });
  });

  it("повёрнутая на 90° фигура тоже остаётся в зале", () => {
    // 180×100 в углу, после поворота занимает 100×180 вокруг того же центра.
    expect(
      clampToHall({ x: 20, y: 20, w: 180, h: 100, rotation: 90 }, hall),
    ).toEqual({ x: 20, y: 40, w: 180, h: 100 });
  });

  it("следующее имя считает по максимальному номеру", () => {
    expect(nextName("Стол", ["Стол 1", "Стол 7", "Русский 2", "Стол x"])).toBe(
      "Стол 8",
    );
    expect(nextName("PS", [])).toBe("PS 1");
  });

  it("новая фигура встаёт в свободное место", () => {
    const spot = freeSpot(
      { w: 180, h: 100 },
      [{ x: 20, y: 20, w: 180, h: 100 }],
      hall,
    );
    expect(spot.x >= 220 || spot.y >= 140).toBe(true);
  });
});

describe("layoutSchema", () => {
  it("отклоняет поворот 360 и пустое имя", () => {
    const r = layoutSchema.safeParse({
      resources: [
        {
          kind: "pool_table",
          name: " ",
          capacity: null,
          x: 0,
          y: 0,
          w: 180,
          h: 100,
          rotation: 360,
          shape: "rect",
          bookable_online: true,
          is_active: true,
        },
      ],
      objects: [],
    });
    expect(r.error?.issues.map((i) => i.path.at(-1))).toEqual([
      "name",
      "rotation",
    ]);
  });
});

describe("layoutSchema и id из seed", () => {
  it("принимает id вида aaaaaaaa-3333-0000-0000-000000000001", () => {
    const r = layoutSchema.safeParse({
      resources: [],
      objects: [
        {
          id: "aaaaaaaa-3333-0000-0000-000000000001",
          kind: "bar",
          label: null,
          x: 0,
          y: 0,
          w: 100,
          h: 50,
          rotation: 0,
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});
