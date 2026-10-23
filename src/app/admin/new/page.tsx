import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createVenueForOwner } from "@/app/admin/actions";
import { PageHeader } from "@/components/app-shell/page-header";
import { VenueForm } from "@/components/venue/venue-form";
import { siteUrl } from "@/lib/site-url";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Platform");
  return { title: t("add") };
}

export default async function NewPlatformVenuePage() {
  const t = await getTranslations("Platform");
  return (
    <>
      <Link
        href="/admin"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {t("title")}
      </Link>
      <PageHeader title={t("add")} description={t("addHint")} />
      <div className="bg-card shadow-card max-w-3xl rounded-2xl p-5 sm:p-6">
        <VenueForm
          action={createVenueForOwner}
          mode="create"
          askOwner
          siteUrl={siteUrl()}
        />
      </div>
    </>
  );
}
