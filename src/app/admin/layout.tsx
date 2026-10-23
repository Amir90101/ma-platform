import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CurrentUser } from "@/components/app-shell/current-user";
import { Logo } from "@/components/app-shell/logo";
import { isPlatformAdmin } from "@/lib/platform";

// Кабинет владельца платформы: список подключённых заведений и подключение
// новых. Деньги и гости заведений сюда не попадают — их закрывает RLS.
export default async function PlatformLayout({
  children,
}: LayoutProps<"/admin">) {
  const t = await getTranslations("Platform");
  const tCommon = await getTranslations("Common");
  return (
    <>
      <header className="bg-card/80 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <Link
            href="/admin"
            aria-label={tCommon("productName")}
            className="flex items-center gap-3"
          >
            <Logo name={tCommon("productName")} />
            <span className="bg-sidebar rounded-full px-2.5 py-0.5 text-xs font-semibold text-white">
              {t("badge")}
            </span>
          </Link>
          <Suspense>
            <CurrentUser />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
        <Suspense
          fallback={<p className="text-muted-foreground">{t("loading")}</p>}
        >
          <PlatformGate>{children}</PlatformGate>
        </Suspense>
      </main>
    </>
  );
}

async function PlatformGate({ children }: { children: React.ReactNode }) {
  if (!(await isPlatformAdmin())) notFound();
  return children;
}
