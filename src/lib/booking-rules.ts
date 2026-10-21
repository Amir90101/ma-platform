// «Пришёл» показываем за 3 часа до начала брони и до её конца: гость может
// прийти раньше, а раньше этого кнопка только мешает. База ограничивает
// лишь конец брони (booking_ended).
export const ARRIVE_EARLY_MS = 3 * 60 * 60 * 1000;

export function canArrive(
  startsAt: string,
  endsAt: string,
  now: number,
): boolean {
  return (
    Date.parse(startsAt) - now <= ARRIVE_EARLY_MS && Date.parse(endsAt) > now
  );
}
