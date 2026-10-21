// Перед отправкой в Sentry вычищаем данные гостей: телефоны в любом виде
// (+7 700 123 45 67, 87001234567, (700) 123-45-67) и токены личных ссылок
// /b/{token} — по токену бронь можно отменить.

const PHONE =
  /(?<![\w-])(?:(?:\+?7|8)[\s-]*)?\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?![\w-])/g;
const BOOKING_TOKEN = /\/b\/[0-9a-f]{16,}/gi;

export const PHONE_MASK = "[телефон]";

export function scrubText(text: string): string {
  return text
    .replace(BOOKING_TOKEN, "/b/[token]")
    .replace(PHONE, (match) =>
      match.replace(/\D/g, "").length >= 10 ? PHONE_MASK : match,
    );
}

// Глубокая копия события со вычищенными строками. Ключи не трогаем.
export function scrubEvent<T>(value: T): T {
  if (typeof value === "string") return scrubText(value) as T;
  if (Array.isArray(value)) return value.map(scrubEvent) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, scrubEvent(v)]),
    ) as T;
  }
  return value;
}
