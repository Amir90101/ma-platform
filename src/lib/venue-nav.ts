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
export function navItems(isOwner: boolean): NavKey[] {
  return isOwner
    ? ["overview", "hall", "bookings", "reports", "audit", "settings"]
    : ["overview", "hall", "bookings"];
}
