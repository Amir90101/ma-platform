import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getVenueAccess } from "@/lib/venue-access";

// Настройки и сотрудники — только владельцу. Администратора возвращаем
// на страницу заведения; данные дополнительно закрыты RLS.
export default async function SettingsLayout({
  children,
  params,
}: LayoutProps<"/app/[venueId]/settings">) {
  const tApp = await getTranslations("App");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
    >
      <OwnerOnly params={params}>{children}</OwnerOnly>
    </Suspense>
  );
}

async function OwnerOnly({
  params,
  children,
}: {
  params: LayoutProps<"/app/[venueId]/settings">["params"];
  children: React.ReactNode;
}) {
  const { venueId } = await params;
  const t = await getTranslations("Venue");
  const access = await getVenueAccess(venueId);
  if (!access) return <p role="alert">{t("notFound")}</p>;
  if (!access.isOwner) redirect(`/app/${venueId}`);

  return (
    <>
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link
          href={`/app/${venueId}`}
          className="text-muted-foreground hover:underline"
        >
          {t("home.backToVenue")}
        </Link>
        <Link href={`/app/${venueId}/settings`} className="hover:underline">
          {t("home.settings")}
        </Link>
        <Link
          href={`/app/${venueId}/settings/hall`}
          className="hover:underline"
        >
          {t("home.hall")}
        </Link>
        <Link
          href={`/app/${venueId}/settings/tariffs`}
          className="hover:underline"
        >
          {t("home.tariffs")}
        </Link>
        <Link
          href={`/app/${venueId}/settings/staff`}
          className="hover:underline"
        >
          {t("home.staff")}
        </Link>
      </nav>
      {children}
    </>
  );
}
