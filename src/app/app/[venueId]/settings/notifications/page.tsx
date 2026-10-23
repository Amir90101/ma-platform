import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { disconnectTelegramChat } from "@/app/app/telegram-actions";
import { PageHeader } from "@/components/app-shell/page-header";
import { TelegramConnect } from "@/components/telegram/telegram-connect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { botUsername } from "@/lib/telegram/api";
import { getVenueAccess } from "@/lib/venue-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Notifications");
  return { title: t("title") };
}

export default async function NotificationsPage({
  params,
}: PageProps<"/app/[venueId]/settings/notifications">) {
  const tApp = await getTranslations("App");
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">{tApp("loading")}</p>}
    >
      <Notifications params={params} />
    </Suspense>
  );
}

async function Notifications({
  params,
}: Pick<PageProps<"/app/[venueId]/settings/notifications">, "params">) {
  const { venueId } = await params;
  const t = await getTranslations("Notifications");
  // Владельца проверил layout настроек; чаты дополнительно закрыты RLS.
  const access = await getVenueAccess(venueId);
  if (!access) return null;
  const { data: chats } = await access.supabase
    .from("telegram_chats")
    .select("id, title, created_at")
    .eq("venue_id", venueId)
    .order("created_at");
  const bot = botUsername();

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title={t("title")} description={t("hint")} />

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("connectTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bot ? (
            <TelegramConnect venueId={venueId} bot={bot} />
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("notConfigured")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("chatsTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!chats?.length ? (
            <p className="text-muted-foreground text-sm">{t("noChats")}</p>
          ) : (
            <ul className="divide-y" data-testid="telegram-chats">
              {chats.map((chat) => {
                const title = chat.title || t("untitled");
                return (
                  <li
                    key={chat.id}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <span className="truncate font-medium">{title}</span>
                    <form
                      action={disconnectTelegramChat.bind(
                        null,
                        venueId,
                        chat.id,
                      )}
                    >
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        aria-label={t("disconnectLabel", { title })}
                      >
                        {t("disconnect")}
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
