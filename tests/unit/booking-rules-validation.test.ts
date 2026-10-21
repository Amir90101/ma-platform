import { describe, expect, it } from "vitest";
import { bookingRulesSchema } from "@/lib/validation/booking-rules";

const valid = {
  online_booking_enabled: true,
  slot_step_min: "30",
  min_duration_min: "60",
  buffer_min: "0",
  min_lead_min: "30",
  max_days_ahead: "14",
  no_show_after_min: "15",
};

const firstError = (input: object) =>
  bookingRulesSchema.safeParse(input).error?.issues[0].message;

describe("bookingRulesSchema", () => {
  it("принимает правила по умолчанию и приводит числа", () => {
    expect(bookingRulesSchema.parse(valid)).toMatchObject({
      slot_step_min: 30,
      min_duration_min: 60,
      max_days_ahead: 14,
    });
  });

  it("пустое поле — ошибка, а не 0", () => {
    expect(firstError({ ...valid, buffer_min: "" })).toBe("buffer");
  });

  it("шаг слота только 15, 30 или 60", () => {
    expect(firstError({ ...valid, slot_step_min: "20" })).toBe("slotStep");
  });

  it("минимальная бронь кратна шагу слота", () => {
    expect(firstError({ ...valid, min_duration_min: "45" })).toBe(
      "minDurationStep",
    );
    expect(
      bookingRulesSchema.safeParse({
        ...valid,
        slot_step_min: "15",
        min_duration_min: "45",
      }).success,
    ).toBe(true);
  });

  it("бронировать вперёд — от 1 до 365 дней", () => {
    expect(firstError({ ...valid, max_days_ahead: "0" })).toBe("daysAhead");
    expect(firstError({ ...valid, max_days_ahead: "400" })).toBe("daysAhead");
  });
});
