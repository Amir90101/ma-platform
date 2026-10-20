import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
        className="text-muted-foreground text-sm hover:underline"
      >
        {tApp("backToVenues")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
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
