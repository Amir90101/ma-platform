import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getVenueAccess } from "@/lib/venue-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Audit");
  return { title: t("title") };
}

const ACTIONS = [
  "session.voided",
  "session.discount",
  "session.time_edited",
  "payment.voided",
] as const;
type Action = (typeof ACTIONS)[number];

// Журнал действий: только владелец (RLS и редирект для администратора).
export default async function AuditPage({
  params,
}: PageProps<"/app/[venueId]/audit">) {
  const tApp = await getTranslations("App");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
    >
      <Audit params={params} />
    </Suspense>
  );
}

async function Audit({
  params,
}: Pick<PageProps<"/app/[venueId]/audit">, "params">) {
  const { venueId } = await params;
  const t = await getTranslations("Audit");
  const tVenue = await getTranslations("Venue");
  const access = await getVenueAccess(venueId);
  if (!access) return <p role="alert">{tVenue("notFound")}</p>;
  if (!access.isOwner) redirect(`/app/${venueId}`);
  const { supabase, venue } = access;

  const [{ data: rows }, { data: staff }, { data: venueRow }] =
    await Promise.all([
      supabase
        .from("audit_log")
        .select("id, user_id, action, before, after, created_at")
        .eq("venue_id", venue.id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.rpc("get_org_staff", { p_org_id: venue.org_id }),
      supabase.from("venues").select("timezone").eq("id", venue.id).single(),
    ]);
  const emails = new Map((staff ?? []).map((s) => [s.user_id, s.email]));
  const when = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: venueRow?.timezone ?? "Asia/Almaty",
  });

  function details(action: Action, before: Json, after: Json) {
    switch (action) {
      case "session.discount":
        return t("details.discount", {
          amount: Number(after.discount_amount ?? 0),
          total: Number(after.total_amount ?? 0),
        });
      case "session.voided":
        return t("details.voided", { reason: String(after.void_reason ?? "") });
      case "payment.voided":
        return t("details.paymentVoided", {
          amount: Number(before.amount ?? 0),
          method: t(`methods.${String(before.method)}`),
          reason: String(after.void_reason ?? ""),
        });
      case "session.time_edited":
        return t("details.timeEdited");
    }
  }

  return (
    <>
      <Link
        href={`/app/${venue.id}`}
        className="text-muted-foreground text-sm hover:underline"
      >
        {tVenue("home.backToVenue")}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("hint")}</p>
      </div>
      {rows?.length ? (
        <ul className="divide-y rounded-lg border" data-testid="audit-list">
          {rows.map((row) => {
            const action = ACTIONS.includes(row.action as Action)
              ? (row.action as Action)
              : null;
            return (
              <li key={row.id} className="grid gap-0.5 px-4 py-3 text-sm">
                <p className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    {action
                      ? // В ключах next-intl точка — вложенность: session.voided → session_voided.
                        t(`actions.${action.replace(".", "_")}`)
                      : row.action}
                  </span>
                  <span className="text-muted-foreground">
                    {when.format(new Date(row.created_at))}
                  </span>
                </p>
                {action && (
                  <p>
                    {details(
                      action,
                      (row.before ?? {}) as Json,
                      (row.after ?? {}) as Json,
                    )}
                  </p>
                )}
                <p className="text-muted-foreground">
                  {t("author", {
                    who:
                      (row.user_id && emails.get(row.user_id)) || t("system"),
                  })}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t("empty")}</p>
      )}
    </>
  );
}

type Json = Record<string, unknown>;
