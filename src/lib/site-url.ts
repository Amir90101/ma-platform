// Адрес приложения для ссылок в письмах и подсказки адреса страницы заведения.
export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
