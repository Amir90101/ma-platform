import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const t = await getTranslations("App");
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/app" className="font-semibold">
            {t("title")}
          </Link>
          <Suspense>
            <CurrentUser />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
        {children}
      </main>
    </div>
  );
}

async function CurrentUser() {
  const t = await getTranslations("App");
  const supabase = await createClient();
  // Proxy уже не пускает без входа; здесь вторая проверка на сервере.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        data-testid="current-user"
        className="text-muted-foreground truncate text-sm"
      >
        {t("signedInAs", { email: String(data.claims.email) })}
      </span>
      <form action={logout}>
        <Button type="submit" variant="outline" size="sm">
          {t("logout")}
        </Button>
      </form>
    </div>
  );
}
