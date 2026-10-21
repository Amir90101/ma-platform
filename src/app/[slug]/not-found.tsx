import { getTranslations } from "next-intl/server";

export default async function PublicVenueNotFound() {
  const t = await getTranslations("Public");
  return (
    <main className="mx-auto grid w-full max-w-2xl flex-1 content-center gap-2 px-4 py-10 text-center">
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFound")}</p>
    </main>
  );
}
