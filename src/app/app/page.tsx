import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("App");
  return { title: t("title") };
}

export default async function AppHome() {
  const t = await getTranslations("App");
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <Suspense
        fallback={<p className="text-muted-foreground">{t("loading")}</p>}
      >
        <CurrentUser />
      </Suspense>
    </main>
  );
}

async function CurrentUser() {
  const t = await getTranslations("App");
  const supabase = await createClient();
  // Proxy уже не пускает без входа; здесь вторая проверка на сервере.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  return (
    <>
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <form action={logout}>
          <Button type="submit" variant="outline">
            {t("logout")}
          </Button>
        </form>
      </header>
      <p data-testid="current-user">
        {t("signedInAs", { email: String(data.claims.email) })}
      </p>
      <p className="text-muted-foreground">{t("noVenuesYet")}</p>
    </>
  );
}
