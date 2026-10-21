import { addDays, isDateString } from "@/lib/venue-time";

// Период отчёта из адреса ?from=…&to=…; по умолчанию — текущий месяц до сегодня.
export function reportPeriod(
  today: string,
  from: unknown,
  to: unknown,
): { from: string; to: string } {
  return {
    from: isDateString(from) ? from : monthStart(today),
    to: isDateString(to) ? to : today,
  };
}

export function monthStart(date: string): string {
  return `${date.slice(0, 8)}01`;
}

// Быстрые периоды: сегодня, 7 дней, этот месяц, прошлый месяц.
export function periodPresets(today: string) {
  const thisMonth = monthStart(today);
  const prevMonthEnd = addDays(thisMonth, -1);
  return {
    today: { from: today, to: today },
    week: { from: addDays(today, -6), to: today },
    month: { from: thisMonth, to: today },
    prevMonth: { from: monthStart(prevMonthEnd), to: prevMonthEnd },
  } as const;
}
