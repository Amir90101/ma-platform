import { zonedToUtc } from "@/lib/venue-time";

// iiko принимает и отдаёт местное время терминала: «2026-10-24 19:00:00.000».
// Пояс терминала считаем равным поясу заведения.

export function toIikoTime(at: Date, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.000`;
}

export function fromIikoTime(value: string, timezone: string): Date {
  const [date, time] = value.split(" ");
  return zonedToUtc(date, time.slice(0, 5), timezone);
}

// Свободно ли место на [start, start + minutes): резервы iiko на его стол
// не пересекаются с окном с учётом буфера между бронями.
export function freeInIiko(
  reserves: {
    tableIds: string[];
    estimatedStartTime: string;
    durationInMinutes: number;
  }[],
  tableId: string,
  start: Date,
  minutes: number,
  bufferMin: number,
  timezone: string,
) {
  const from = start.getTime();
  const to = from + minutes * 60_000;
  return !reserves.some((r) => {
    if (!r.tableIds.includes(tableId)) return false;
    const rFrom = fromIikoTime(r.estimatedStartTime, timezone).getTime();
    const rTo = rFrom + (r.durationInMinutes + bufferMin) * 60_000;
    return rFrom - bufferMin * 60_000 < to && from < rTo;
  });
}
