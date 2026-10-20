import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

// Служебная страница: проверяет, что приложение достаёт до базы.
export default async function HealthPage() {
  const t = await getTranslations("Health");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <Suspense fallback={<p>{t("checking")}</p>}>
        <DatabaseStatus />
      </Suspense>
    </main>
  );
}

async function DatabaseStatus() {
  const t = await getTranslations("Health");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("server_now");

  if (error) {
    return (
      <p data-testid="db-status" className="text-destructive">
        {t("dbDown", { message: error.message })}
      </p>
    );
  }
  return (
    <p data-testid="db-status">{t("dbUp", { serverTime: String(data) })}</p>
  );
}
