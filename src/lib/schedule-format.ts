// Дни недели 1–7 списком диапазонов: [1,2,3,4,5,7] → «Пн–Пт, Вс».
export function formatWeekdays(
  days: number[],
  labels: Record<number, string>,
): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const ranges: [number, number][] = [];
  for (const d of sorted) {
    const last = ranges.at(-1);
    if (last && d === last[1] + 1) last[1] = d;
    else ranges.push([d, d]);
  }
  return ranges
    .map(([from, to]) =>
      from === to
        ? labels[from]
        : to === from + 1
          ? `${labels[from]}, ${labels[to]}`
          : `${labels[from]}–${labels[to]}`,
    )
    .join(", ");
}

// "10:00:00" или "10:00" → "10:00".
export function hhmm(time: string): string {
  return time.slice(0, 5);
}
