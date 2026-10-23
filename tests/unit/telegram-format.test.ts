import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../messages/ru.json";
import { escapeHtml, formatNotification } from "@/lib/telegram/format";

const translator = createTranslator({
  locale: "ru",
  messages,
  namespace: "Telegram",
});
const t = (key: string, values?: Record<string, string | number>) =>
  translator(key as never, values as never);

const booking = {
  venue: "Демо <Бильярд>",
  timezone: "Asia/Almaty",
  resource: "Стол 1",
  starts_at: "2026-10-24T14:00:00Z",
  ends_at: "2026-10-24T16:00:00Z",
  source: "online" as const,
  guests: 3,
  comment: "день рождения & торт",
  customer_name: "Самал",
  customer_phone: "+77071234567",
  package: "2 часа",
  cancel_reason: null,
  cancelled_by_guest: false,
};

describe("formatNotification", () => {
  it("новая бронь: время в поясе заведения, гость, тариф, HTML экранирован", () => {
    const text = formatNotification("booking_created", booking, t);
    expect(text).toBe(
      [
        "<b>Новая бронь</b> · Демо &lt;Бильярд&gt;",
        "Стол 1, сб, 24 окт., 19:00–21:00",
        "Самал, +77071234567",
        "Онлайн с сайта",
        "Тариф: 2 часа",
        "Гостей: 3",
        "Комментарий: день рождения &amp; торт",
      ].join("\n"),
    );
  });

  it("отмена гостем и отмена с причиной", () => {
    expect(
      formatNotification(
        "booking_cancelled",
        { ...booking, cancelled_by_guest: true },
        t,
      ),
    ).toContain("Гость отменил сам по ссылке");
    expect(
      formatNotification(
        "booking_cancelled",
        { ...booking, cancel_reason: "Перенос" },
        t,
      ),
    ).toContain("Причина: Перенос");
  });

  it("закрытие смены с недостачей", () => {
    const text = formatNotification(
      "shift_closed",
      {
        venue: "Демо Бильярд",
        timezone: "Asia/Almaty",
        closed_by: "Айгерим",
        expected_cash: 15000,
        closing_cash: 14500,
      },
      t,
    );
    expect(text).toContain("Закрыл: Айгерим");
    expect(text).toContain("разница -500 ₸");
    expect(text).toContain("<b>Недостача 500 ₸</b>");
  });

  it("escapeHtml", () => {
    expect(escapeHtml("<a&b>")).toBe("&lt;a&amp;b&gt;");
  });
});
