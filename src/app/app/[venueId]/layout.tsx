import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CurrentUser } from "@/components/app-shell/current-user";
import { Logo, LogoMark } from "@/components/app-shell/logo";
import { BottomNav, SidebarNav } from "@/components/app-shell/venue-nav";
import { navItems } from "@/lib/venue-nav";
import { OnlineBookingAlerts } from "@/components/bookings/online-booking-alerts";
import { getVenueAccess } from "@/lib/venue-access";

// Каркас экранов заведения: боковая панель на компьютере, нижние вкладки на
// телефоне, общая верхняя полоса с пользователем. Уведомления о новых
// онлайн-бронях видны на любом экране и не теряются при переходах.
export default function VenueLayout({
  children,
  params,
}: LayoutProps<"/app/[venueId]">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <VenueShell params={params}>{children}</VenueShell>
    </Suspense>
  );
}

async function VenueShell({
  children,
  params,
}: Pick<LayoutProps<"/app/[venueId]">, "children" | "params">) {
  const { venueId } = await params;
  const access = await getVenueAccess(venueId);
  const t = await getTranslations("Shell");
  const tCommon = await getTranslations("Common");
  const tVenue = await getTranslations("Venue");
  // Нет доступа — страница сама покажет «не найдено», навигации нет.
  const items = access ? navItems(access.isOwner) : [];

  return (
    <div className="flex flex-1">
      <aside className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-6 p-4 lg:flex">
        <Link
          href="/app"
          aria-label={tCommon("productName")}
          className="px-2 pt-1"
        >
          <Logo
            name={tCommon("productName")}
            className="text-sidebar-accent-foreground"
          />
        </Link>
        {access && (
          <div className="bg-sidebar-accent/50 rounded-lg px-3 py-2.5">
            <p className="text-sidebar-foreground/60 text-xs">
              {tVenue(`types.${access.venue.type}`)}
            </p>
            <p className="text-sidebar-accent-foreground truncate font-semibold">
              {access.venue.name}
            </p>
          </div>
        )}
        {access && <SidebarNav venueId={venueId} items={items} />}
        <Link
          href="/app"
          className="text-sidebar-foreground/60 hover:text-sidebar-accent-foreground mt-auto flex items-center gap-2 px-3 py-2 text-sm"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t("allVenues")}
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/85 sticky top-0 z-30 border-b backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 lg:px-8">
            <Link
              href="/app"
              className="flex min-w-0 items-center gap-2 lg:hidden"
              aria-label={t("allVenues")}
            >
              <LogoMark />
              <span className="truncate font-semibold">
                {access?.venue.name ?? tCommon("productName")}
              </span>
            </Link>
            <span className="hidden lg:block" />
            <Suspense>
              <CurrentUser />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pt-6 pb-24 lg:px-8 lg:pt-8 lg:pb-12">
          {children}
        </main>
      </div>

      {access && <BottomNav venueId={venueId} items={items} />}
      <Suspense fallback={null}>
        <OnlineBookingAlerts />
      </Suspense>
    </div>
  );
}

async function ShellFallback() {
  const tCommon = await getTranslations("Common");
  return (
    <div className="flex flex-1">
      <aside className="bg-sidebar hidden h-svh w-64 shrink-0 p-4 lg:block">
        <Logo
          name={tCommon("productName")}
          className="text-sidebar-accent-foreground px-2 pt-1"
        />
      </aside>
      <div className="flex-1" />
    </div>
  );
}
