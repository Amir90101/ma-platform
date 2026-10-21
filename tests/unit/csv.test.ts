import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("BOM, «;» и CRLF для русского Excel", () => {
    expect(toCsv(["День", "Итого"], [["2026-10-01", 1500]])).toBe(
      "﻿День;Итого\r\n2026-10-01;1500\r\n",
    );
  });

  it("дробные числа через запятую, пустые значения пустые", () => {
    expect(toCsv(["%"], [[10.9], [null]])).toBe("﻿%\r\n10,9\r\n\r\n");
  });

  it("экранирует кавычки и разделитель", () => {
    expect(toCsv(["Имя"], [['Стол "VIP"; угловой']])).toBe(
      '﻿Имя\r\n"Стол ""VIP""; угловой"\r\n',
    );
  });
});
