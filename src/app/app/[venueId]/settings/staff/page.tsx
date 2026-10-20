import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { inviteAdmin, removeAdmin } from "@/app/app/staff-actions";
import { InviteForm } from "@/components/staff/invite-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getVenueAccess } from "@/lib/venue-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Staff");
  return { title: t("title") };
}

export default async function StaffPage({
  params,
}: PageProps<"/app/[venueId]/settings/staff">) {
  const tApp = await getTranslations("App");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
    >
      <Staff params={params} />
    </Suspense>
  );
}

async function Staff({
  params,
}: {
  params: PageProps<"/app/[venueId]/settings/staff">["params"];
}) {
  const { venueId } = await params;
  const t = await getTranslations("Staff");
  // Владельца проверил layout настроек; get_org_staff ещё раз проверяет в базе.
  const access = await getVenueAccess(venueId);
  if (!access) return null;
  const { supabase, venue } = access;
  const { data: staff } = await supabase.rpc("get_org_staff", {
    p_org_id: venue.org_id,
  });

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("hint")}</p>
      </div>

      <Card>
        <CardContent>
          <InviteForm action={inviteAdmin.bind(null, venue.id)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("listTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y" data-testid="staff-list">
            {(staff ?? []).map((member) => (
              <li
                key={member.user_id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate">{member.email}</span>
                  <span className="text-muted-foreground text-sm">
                    {member.full_name ? `${member.full_name} · ` : ""}
                    {t(`roles.${member.role}`)}
                  </span>
                </span>
                {member.role === "admin" && (
                  <form
                    action={removeAdmin.bind(null, venue.id, member.user_id)}
                  >
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      aria-label={t("removeLabel", { email: member.email })}
                    >
                      {t("remove")}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
