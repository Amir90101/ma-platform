import { describe, expect, it } from "vitest";
import { iikoTableLayout } from "@/lib/iiko/layout";
import { freeInIiko, fromIikoTime, toIikoTime } from "@/lib/iiko/time";

const TZ = "Asia/Almaty";

describe("время iiko", () => {
  it("местное время терминала туда и обратно", () => {
    const at = new Date("2026-10-24T14:00:00Z");
    expect(toIikoTime(at, TZ)).toBe("2026-10-24 19:00:00.000");
    expect(fromIikoTime("2026-10-24 19:00:00.000", TZ).toISOString()).toBe(
      at.toISOString(),
    );
  });
});

describe("freeInIiko", () => {
  const reserves = [
    {
      tableIds: ["t1"],
      estimatedStartTime: "2026-10-24 19:00:00.000",
      durationInMinutes: 120,
    },
  ];
  const at = (hhmm: string) => fromIikoTime(`2026-10-24 ${hhmm}:00.000`, TZ);

  it("пересечение с резервом на тот же стол — занято", () => {
    expect(freeInIiko(reserves, "t1", at("20:00"), 60, 0, TZ)).toBe(false);
    expect(freeInIiko(reserves, "t1", at("18:30"), 60, 0, TZ)).toBe(false);
  });

  it("встык и другой стол — свободно", () => {
    expect(freeInIiko(reserves, "t1", at("21:00"), 60, 0, TZ)).toBe(true);
    expect(freeInIiko(reserves, "t1", at("18:00"), 60, 0, TZ)).toBe(true);
    expect(freeInIiko(reserves, "t2", at("20:00"), 60, 0, TZ)).toBe(true);
  });

  it("буфер между бронями расширяет резерв с обеих сторон", () => {
    expect(freeInIiko(reserves, "t1", at("21:00"), 60, 15, TZ)).toBe(false);
    expect(freeInIiko(reserves, "t1", at("17:50"), 60, 15, TZ)).toBe(false);
    expect(freeInIiko(reserves, "t1", at("21:15"), 60, 15, TZ)).toBe(true);
  });
});

describe("iikoTableLayout", () => {
  it("столы по номеру, сеткой по 7 в ряд", () => {
    const tables = Array.from({ length: 9 }, (_, i) => ({
      id: `t${i}`,
      name: "",
      number: 9 - i,
      seatingCapacity: 4,
    }));
    const layout = iikoTableLayout(tables, "other");
    expect(layout[0]).toMatchObject({ name: "1", x: 40, y: 40, capacity: 4 });
    expect(layout[7]).toMatchObject({ name: "8", x: 40, y: 170 });
  });
});
