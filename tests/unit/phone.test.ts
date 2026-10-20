import { describe, expect, it } from "vitest";
import { normalizeKzPhone } from "@/lib/phone";

describe("normalizeKzPhone", () => {
  it.each([
    ["8 700 123 45 67", "+77001234567"],
    ["+7 (700) 123-45-67", "+77001234567"],
    ["7001234567", "+77001234567"],
    ["77001234567", "+77001234567"],
    ["12345", null],
    ["+1 202 555 0100", null],
  ])("%s → %s", (input, expected) => {
    expect(normalizeKzPhone(input)).toBe(expected);
  });
});
