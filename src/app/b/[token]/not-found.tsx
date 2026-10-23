import { getTranslations } from "next-intl/server";

export default async function GuestBookingNotFound() {
  const t = await getTranslations("GuestBooking");
  return (
    <main className="public-dark dark bg-background text-foreground grid w-full flex-1 content-center gap-2 px-4 py-10 text-center">
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFound")}</p>
    </main>
  );
}
