import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ShiftEndForm } from "@/components/shift/shift-end-form";
import { getVenueAccess } from "@/lib/venue-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Shift");
  return { title: t("endTitle") };
}

// Выход сотрудника: закрыть смену с пересчётом кассы и выйти.
export default async function ShiftEndPage({
  params,
}: PageProps<"/app/[venueId]/shift-end">) {
  const t = await getTranslations("Shift");
  const tApp = await getTranslations("App");
  return (
    <section
      className="bg-card shadow-card mx-auto grid w-full max-w-md gap-5 rounded-3xl p-6 sm:p-8"
      aria-labelledby="shift-end-title"
      data-testid="shift-end"
    >
      <div className="grid gap-1">
        <h1 id="shift-end-title" className="text-2xl font-bold">
          {t("endTitle")}
        </h1>
        <p className="text-muted-foreground">{t("endHint")}</p>
      </div>
      <Suspense
        fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
      >
        <EndForm params={params} />
      </Suspense>
    </section>
  );
}

async function EndForm({
  params,
}: Pick<PageProps<"/app/[venueId]/shift-end">, "params">) {
  const { venueId } = await params;
  const access = await getVenueAccess(venueId);
  if (!access) return null;
  const { data: shift } = await access.supabase
    .from("shifts")
    .select("id")
    .eq("venue_id", venueId)
    .is("closed_at", null)
    .maybeSingle();
  return <ShiftEndForm venueId={venueId} shiftId={shift?.id ?? null} />;
}
