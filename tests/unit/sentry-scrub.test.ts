import { describe, expect, it } from "vitest";
import { scrubEvent, scrubText } from "@/lib/sentry-scrub";

describe("scrubText", () => {
  it("прячет телефоны в любом виде", () => {
    for (const phone of [
      "+77001234567",
      "+7 700 123 45 67",
      "8 (700) 123-45-67",
      "87001234567",
      "7001234567",
    ]) {
      expect(scrubText(`гость ${phone} опоздал`)).toBe(
        "гость [телефон] опоздал",
      );
    }
  });

  it("не трогает суммы, даты и uuid", () => {
    const text =
      "Сумма 15000 ₸, 2026-10-21 19:00, бронь aaaaaaaa-3333-0000-0000-000000000001";
    expect(scrubText(text)).toBe(text);
  });

  it("прячет токен личной ссылки брони", () => {
    expect(
      scrubText("https://site.kz/b/382ba91db372901a2e6b0c6e122a1f3af81b?x=1"),
    ).toBe("https://site.kz/b/[token]?x=1");
  });
});

describe("scrubEvent", () => {
  it("проходит по вложенным объектам и массивам, ключи не меняет", () => {
    const event = {
      message: "Ошибка для +77001234567",
      request: {
        url: "/b/382ba91db372901a2e6b0c6e122a1f3af81b",
        data: { phone: "8 700 123 45 67" },
      },
      breadcrumbs: [{ message: "звонок 87001234567" }],
      level: "error",
      count: 3,
    };
    expect(scrubEvent(event)).toEqual({
      message: "Ошибка для [телефон]",
      request: { url: "/b/[token]", data: { phone: "[телефон]" } },
      breadcrumbs: [{ message: "звонок [телефон]" }],
      level: "error",
      count: 3,
    });
  });
});
