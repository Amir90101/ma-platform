"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  ChartColumn,
  LayoutDashboard,
  Map,
  ScrollText,
  Settings,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NAV_PATHS as PATHS, type NavKey } from "@/lib/venue-nav";

const ICONS = {
  overview: LayoutDashboard,
  hall: Map,
  bookings: CalendarClock,
  reports: ChartColumn,
  audit: ScrollText,
  settings: Settings,
} as const;

function useActive(venueId: string) {
  const pathname = usePathname();
  return (key: NavKey) => {
    const href = `/app/${venueId}${PATHS[key]}`;
    return key === "overview"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
  };
}

// Боковая панель: компьютер и большой планшет.
export function SidebarNav({
  venueId,
  items,
}: {
  venueId: string;
  items: NavKey[];
}) {
  const t = useTranslations("Shell");
  const isActive = useActive(venueId);
  return (
    <nav aria-label={t("nav")} className="grid gap-1">
      {items.map((key) => {
        const Icon = ICONS[key];
        const active = isActive(key);
        return (
          <Link
            key={key}
            href={`/app/${venueId}${PATHS[key]}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground before:bg-sidebar-primary before:absolute before:inset-y-2 before:-left-4 before:w-1 before:rounded-r-full"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn("size-5", active && "text-sidebar-primary")}
            />
            {t(`items.${key}`)}
          </Link>
        );
      })}
    </nav>
  );
}

// Нижняя панель вкладок: телефон и небольшой планшет. Журнал действий
// владельца отсюда убран (не больше пяти вкладок) — он в «Обзоре».
export function BottomNav({
  venueId,
  items,
}: {
  venueId: string;
  items: NavKey[];
}) {
  const t = useTranslations("Shell");
  const isActive = useActive(venueId);
  const tabs = items.filter((k) => k !== "audit");
  return (
    <nav
      aria-label={t("nav")}
      className="bg-sidebar fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul
        className="mx-auto grid max-w-lg"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
      >
        {tabs.map((key) => {
          const Icon = ICONS[key];
          const active = isActive(key);
          return (
            <li key={key}>
              <Link
                href={`/app/${venueId}${PATHS[key]}`}
                aria-current={active ? "page" : undefined}
                aria-label={t(`items.${key}`)}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-white" : "text-sidebar-foreground",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn("size-5", active && "text-sidebar-primary")}
                />
                <span aria-hidden="true">{t(`short.${key}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
