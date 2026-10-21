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
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
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
      className="bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
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
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span aria-hidden="true">{t(`short.${key}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
