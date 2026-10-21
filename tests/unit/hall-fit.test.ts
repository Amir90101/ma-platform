import { describe, expect, it } from "vitest";
import { fitToItems } from "@/lib/hall/fit";

const item = (x: number, y: number, w = 100, h = 50, rotation = 0) => ({
  x,
  y,
  w,
  h,
  rotation,
});

describe("fitToItems", () => {
  it("обрезает пустые края с отступом", () => {
    const fitted = fitToItems({ width: 1200, height: 800 }, [
      item(100, 100),
      item(400, 300),
    ]);
    expect(fitted.size).toEqual({ width: 460, height: 310 });
    expect(fitted.items.map((i) => [i.x, i.y])).toEqual([
      [30, 30],
      [330, 230],
    ]);
  });

  it("не выходит за границы зала", () => {
    const fitted = fitToItems({ width: 500, height: 300 }, [
      item(0, 0),
      item(400, 250),
    ]);
    expect(fitted.size).toEqual({ width: 500, height: 300 });
    expect(fitted.items[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("повёрнутую фигуру берёт с запасом", () => {
    const fitted = fitToItems({ width: 1200, height: 800 }, [
      item(300, 300, 200, 100, 90),
    ]);
    // Центр (400, 350), запас 100 по большей стороне и отступ 30.
    expect(fitted.size).toEqual({ width: 260, height: 260 });
  });

  it("пустой зал не трогает", () => {
    const fitted = fitToItems({ width: 1200, height: 800 }, []);
    expect(fitted.size).toEqual({ width: 1200, height: 800 });
  });
});
