import { describe, expect, it } from "vitest";
import {
  fieldErrors,
  loginSchema,
  resetPasswordSchema,
  safeNextPath,
  staffSchema,
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
    const r = loginSchema.safeParse({ email: "owner@", password: "" });
    expect(r.success).toBe(false);
    expect(fieldErrors(r.error!)).toEqual({
      email: "emailOrLoginInvalid",
      password: "passwordRequired",
    });
  });

  it("логин сотрудника превращается в служебный адрес", () => {
    const r = loginSchema.parse({ email: " Aigerim.K ", password: "x" });
    expect(r.email).toBe("aigerim.k@staff.local");
  });

  it("логин с пробелом или короче трёх символов не принимается", () => {
    for (const email of ["ai", "ai gerim", "-aigerim"]) {
      const r = loginSchema.safeParse({ email, password: "x" });
      expect(fieldErrors(r.error!)).toEqual({ email: "emailOrLoginInvalid" });
    }
  });
});

describe("staffSchema", () => {
  it("логин латиницей, пароль от 8 символов, имя обязательно", () => {
    const r = staffSchema.safeParse({
      fullName: " ",
      login: "Айгерим",
      password: "1234567",
    });
    expect(fieldErrors(r.error!)).toEqual({
      fullName: "nameRequired",
      login: "loginFormat",
      password: "passwordTooShort",
    });
    expect(
      staffSchema.parse({
        fullName: "Айгерим",
        login: " Aigerim ",
        password: "12345678",
      }).login,
    ).toBe("aigerim");
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
