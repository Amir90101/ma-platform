import { describe, expect, it } from "vitest";
import { durationOptions } from "@/lib/public-booking";

describe("durationOptions", () => {
  it("от минимальной брони шагом 30 минут на шесть часов", () => {
    const options = durationOptions(60, 30);
    expect(options[0]).toBe(60);
    expect(options[1]).toBe(90);
    expect(options.at(-1)).toBe(420);
  });

  it("шаг слота 60 — варианты по часу", () => {
    expect(durationOptions(60, 60).slice(0, 3)).toEqual([60, 120, 180]);
  });

  it("минимум, не кратный шагу, округляется вверх", () => {
    expect(durationOptions(45, 30)[0]).toBe(60);
  });
});
