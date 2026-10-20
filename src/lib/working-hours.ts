import type { WorkingDay } from "@/lib/validation/venue";

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Открыто ли заведение в этот местный момент недели (день 1–7, минута от
// полуночи). Ночные часы (close <= open) продолжаются в следующий день.
export function isOpenAt(
  hours: WorkingDay[],
  weekday: number,
  minute: number,
): boolean {
  const prev = weekday === 1 ? 7 : weekday - 1;
  return hours.some((d) => {
    const open = toMinutes(d.open);
    const close = toMinutes(d.close);
    if (close > open) {
      return d.weekday === weekday && minute >= open && minute < close;
    }
    return (
      (d.weekday === weekday && minute >= open) ||
      (d.weekday === prev && minute < close)
    );
  });
}
