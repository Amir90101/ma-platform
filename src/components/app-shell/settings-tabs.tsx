"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const TABS = [
  ["", "profile"],
  ["/hall", "hall"],
  ["/tariffs", "tariffs"],
  ["/booking", "booking"],
  ["/staff", "staff"],
  ["/notifications", "notifications"],
] as const;

// Вкладки настроек заведения. На телефоне листаются по горизонтали.
export function SettingsTabs({ venueId }: { venueId: string }) {
  const t = useTranslations("Shell");
  const pathname = usePathname();
  const base = `/app/${venueId}/settings`;
  return (
    <nav
      aria-label={t("settingsNav")}
      className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4 lg:mx-0 lg:px-0"
    >
      <ul className="flex w-max gap-1 border-b">
        {TABS.map(([path, key]) => {
          const href = `${base}${path}`;
          const active = pathname === href;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px block border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {t(`settingsTabs.${key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
