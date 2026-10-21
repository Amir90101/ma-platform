import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CurrentUser } from "@/components/app-shell/current-user";
import { Logo } from "@/components/app-shell/logo";

// Список заведений и создание нового: шапка без навигации заведения.
export default async function HomeLayout({ children }: LayoutProps<"/app">) {
  const tCommon = await getTranslations("Common");
  return (
    <>
      <header className="bg-card/80 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-4 px-4">
          <Link href="/app" aria-label={tCommon("productName")}>
            <Logo name={tCommon("productName")} />
          </Link>
          <Suspense>
            <CurrentUser />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
        {children}
      </main>
    </>
  );
}
