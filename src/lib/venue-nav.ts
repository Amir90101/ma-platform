// Разделы заведения в навигации. Общий модуль: список строит сервер
// (по роли), отрисовывает клиент (подсветка текущего раздела).
export type NavKey =
  "overview" | "hall" | "bookings" | "reports" | "audit" | "settings";

export const NAV_PATHS: Record<NavKey, string> = {
  overview: "",
  hall: "/hall",
  bookings: "/bookings",
  reports: "/reports",
  audit: "/audit",
  settings: "/settings",
};

// Администратору — рабочие экраны, владельцу — ещё отчёты, журнал, настройки.
// Заведение «только онлайн-бронь» (касса в iiko): без карты сеансов и отчётов.
export function navItems(isOwner: boolean, bookingOnly = false): NavKey[] {
  const items: NavKey[] = isOwner
    ? ["overview", "hall", "bookings", "reports", "audit", "settings"]
    : ["overview", "hall", "bookings"];
  return bookingOnly
    ? items.filter((k) => k !== "hall" && k !== "reports")
    : items;
}
