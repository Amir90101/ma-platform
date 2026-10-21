import { describe, expect, it } from "vitest";
import {
  addDays,
  addMinutesToTime,
  bookingRange,
  isDateString,
  isoWeekday,
  todayIn,
  zonedToUtc,
} from "@/lib/venue-time";

const NIGHT = [{ weekday: 1, open: "10:00", close: "02:00" }];

describe("venue-time", () => {
  it("проверяет строку даты", () => {
    expect(isDateString("2026-10-21")).toBe(true);
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("21.10.2026")).toBe(false);
    expect(isDateString(undefined)).toBe(false);
  });

  it("сегодня — в часовом поясе заведения", () => {
    // 20:30 UTC — в Алматы (UTC+5) уже следующие сутки.
    const at = new Date("2026-10-21T20:30:00Z");
    expect(todayIn("Asia/Almaty", at)).toBe("2026-10-22");
    expect(todayIn("UTC", at)).toBe("2026-10-21");
  });

  it("сдвигает дату через границу месяца и года", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("день недели — понедельник 1, воскресенье 7", () => {
    expect(isoWeekday("2026-10-19")).toBe(1);
    expect(isoWeekday("2026-10-25")).toBe(7);
  });

  it("местное время → UTC", () => {
    expect(zonedToUtc("2026-10-21", "14:00", "Asia/Almaty").toISOString()).toBe(
      "2026-10-21T09:00:00.000Z",
    );
    // Летнее время в Европе: смещение +2 летом и +1 зимой.
    expect(
      zonedToUtc("2026-07-01", "12:00", "Europe/Berlin").toISOString(),
    ).toBe("2026-07-01T10:00:00.000Z");
    expect(
      zonedToUtc("2026-12-01", "12:00", "Europe/Berlin").toISOString(),
    ).toBe("2026-12-01T11:00:00.000Z");
  });

  it("бронь днём — в тот же день", () => {
    const r = bookingRange(
      "2026-10-19",
      "14:00",
      "16:00",
      NIGHT,
      "Asia/Almaty",
    );
    expect(r.startsAt.toISOString()).toBe("2026-10-19T09:00:00.000Z");
    expect(r.endsAt.toISOString()).toBe("2026-10-19T11:00:00.000Z");
  });

  it("конец после полуночи — следующие сутки", () => {
    const r = bookingRange(
      "2026-10-19",
      "23:00",
      "01:00",
      NIGHT,
      "Asia/Almaty",
    );
    expect(r.startsAt.toISOString()).toBe("2026-10-19T18:00:00.000Z");
    expect(r.endsAt.toISOString()).toBe("2026-10-19T20:00:00.000Z");
  });

  it("ночное время до закрытия — ночь после дня ленты", () => {
    const r = bookingRange(
      "2026-10-19",
      "01:00",
      "01:45",
      NIGHT,
      "Asia/Almaty",
    );
    expect(r.startsAt.toISOString()).toBe("2026-10-19T20:00:00.000Z");
    expect(r.endsAt.toISOString()).toBe("2026-10-19T20:45:00.000Z");
  });

  it("без ночных часов ранняя бронь — в тот же день", () => {
    const r = bookingRange(
      "2026-10-20",
      "01:00",
      "02:00",
      NIGHT,
      "Asia/Almaty",
    );
    expect(r.startsAt.toISOString()).toBe("2026-10-19T20:00:00.000Z");
  });

  it("прибавляет минуты ко времени, через полночь — по кругу", () => {
    expect(addMinutesToTime("14:00", 180)).toBe("17:00");
    expect(addMinutesToTime("23:30", 90)).toBe("01:00");
  });
});
