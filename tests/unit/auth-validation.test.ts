import { describe, expect, it } from "vitest";
import {
  fieldErrors,
  loginSchema,
  resetPasswordSchema,
  safeNextPath,
} from "@/lib/validation/auth";

describe("loginSchema", () => {
  it("приводит email к нижнему регистру и обрезает пробелы", () => {
    const r = loginSchema.parse({
      email: "  Owner@Demo.Local ",
      password: "x",
    });
    expect(r.email).toBe("owner@demo.local");
  });

  it("отклоняет неверный email и пустой пароль", () => {
    const r = loginSchema.safeParse({ email: "owner", password: "" });
    expect(r.success).toBe(false);
    expect(fieldErrors(r.error!)).toEqual({
      email: "emailInvalid",
      password: "passwordRequired",
    });
  });
});

describe("resetPasswordSchema", () => {
  it("требует совпадения паролей", () => {
    const r = resetPasswordSchema.safeParse({
      password: "12345678",
      confirmPassword: "12345679",
    });
    expect(fieldErrors(r.error!)).toEqual({
      confirmPassword: "passwordsDontMatch",
    });
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/app/venue", "/app/venue"],
    [undefined, "/app"],
    ["https://evil.example", "/app"],
    ["//evil.example", "/app"],
    ["/\\evil.example", "/app"],
    ["app", "/app"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
