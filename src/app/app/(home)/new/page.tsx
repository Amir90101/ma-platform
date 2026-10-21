import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { createVenue } from "@/app/app/actions";
import { VenueForm } from "@/components/venue/venue-form";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Venue");
  return { title: t("newTitle") };
}

export default async function NewVenuePage() {
  const t = await getTranslations("Venue");
  const tApp = await getTranslations("App");
  return (
    <>
      <Link
        href="/app"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {tApp("allVenues")}
      </Link>
      <PageHeader title={t("newTitle")} />
      <Suspense
        fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
      >
        <NewVenueForm />
      </Suspense>
    </>
  );
}

async function NewVenueForm() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  // Организации ещё нет — форма спросит её название.
  const { count } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", data?.claims.sub ?? "");

  return (
    <VenueForm
      action={createVenue}
      mode="create"
      askOrgName={!count}
      siteUrl={siteUrl()}
    />
  );
}
