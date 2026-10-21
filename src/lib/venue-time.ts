import type { WorkingDay } from "@/lib/validation/venue";

// Даты и время в часовом поясе заведения. Дата — строка YYYY-MM-DD,
// время — HH:MM, как в input type=date / type=time.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

// Сегодняшняя дата в часовом поясе заведения.
export function todayIn(timezone: string, at = new Date()): string {
  // en-CA форматирует дату как YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// День недели 1–7 (понедельник — 1), как в working_hours.
export function isoWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

// Смещение пояса от UTC в миллисекундах в момент at.
function zoneOffset(at: number, timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(at / 1000) * 1000;
}

// «23:30» + 90 минут → «01:00» (через полночь — по кругу).
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Местные дата и время заведения → момент UTC.
export function zonedToUtc(date: string, time: string, timezone: string): Date {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const first = guess - zoneOffset(guess, timezone);
  // Второй проход — на случай перехода на летнее время между guess и first.
  return new Date(guess - zoneOffset(first, timezone));
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Начало и конец брони, введённые на ленте дня date. Если в этот день
// заведение работает через полночь, время до закрытия — уже следующие
// сутки (01:00 на ленте понедельника — ночь на вторник). Конец не позже
// начала — тоже следующие сутки.
export function bookingRange(
  date: string,
  start: string,
  end: string,
  hours: WorkingDay[],
  timezone: string,
): { startsAt: Date; endsAt: Date } {
  const weekday = isoWeekday(date);
  const night = hours.some(
    (d) =>
      d.weekday === weekday &&
      toMinutes(d.close) <= toMinutes(d.open) &&
      toMinutes(start) < toMinutes(d.close),
  );
  const startDate = night ? addDays(date, 1) : date;
  const endDate =
    toMinutes(end) > toMinutes(start) ? startDate : addDays(startDate, 1);
  return {
    startsAt: zonedToUtc(startDate, start, timezone),
    endsAt: zonedToUtc(endDate, end, timezone),
  };
}
