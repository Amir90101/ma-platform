import { Suspense } from "react";
import { SettingsTabs } from "@/components/app-shell/settings-tabs";
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
      <SettingsTabs venueId={venueId} />
      {children}
    </>
  );
}
