import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { getVenueAccess } from "@/lib/venue-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("App");
  return { title: t("title") };
}

export default async function VenueHomePage({
  params,
}: PageProps<"/app/[venueId]">) {
  const tApp = await getTranslations("App");
  return (
    <>
      <Link
        href="/app"
        className="text-muted-foreground text-sm hover:underline"
      >
        {tApp("backToVenues")}
      </Link>
      <Suspense
        fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
      >
        <VenueHome params={params} />
      </Suspense>
    </>
  );
}

async function VenueHome({
  params,
}: {
  params: PageProps<"/app/[venueId]">["params"];
}) {
  const { venueId } = await params;
  const t = await getTranslations("Venue");
  const access = await getVenueAccess(venueId);
  if (!access) return <p role="alert">{t("notFound")}</p>;
  const { venue, isOwner } = access;

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">{venue.name}</h1>
        <p className="text-muted-foreground" data-testid="venue-role">
          {isOwner ? t("home.roleOwner") : t("home.roleAdmin")}
        </p>
      </div>
      {/* Настройки и сотрудники только владельцу; администратору их не показываем. */}
      {isOwner && (
        <nav className="flex flex-wrap gap-2">
          <Link
            href={`/app/${venue.id}/settings`}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("home.settings")}
          </Link>
          <Link
            href={`/app/${venue.id}/settings/hall`}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("home.hall")}
          </Link>
          <Link
            href={`/app/${venue.id}/settings/staff`}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("home.staff")}
          </Link>
        </nav>
      )}
      <p className="text-muted-foreground">{t("home.workScreensLater")}</p>
    </>
  );
}
