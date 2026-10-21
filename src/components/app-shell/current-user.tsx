import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

// Кто вошёл и кнопка выхода. Proxy уже не пускает без входа; здесь
// вторая проверка на сервере.
export async function CurrentUser() {
  const t = await getTranslations("App");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const email = String(data.claims.email);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        data-testid="current-user"
        className="text-muted-foreground hidden truncate text-sm sm:inline"
        title={email}
      >
        {t("signedInAs", { email })}
      </span>
      <span
        aria-hidden="true"
        className="bg-secondary text-secondary-foreground grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold uppercase"
      >
        {email.slice(0, 1)}
      </span>
      <form action={logout}>
        <Button type="submit" variant="ghost" size="sm">
          <LogOut aria-hidden="true" />
          {t("logout")}
        </Button>
      </form>
    </div>
  );
}
