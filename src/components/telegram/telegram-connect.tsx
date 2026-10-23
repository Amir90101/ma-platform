"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { createTelegramLinkCode } from "@/app/app/telegram-actions";
import { Button, buttonVariants } from "@/components/ui/button";

// Ссылка подключения: личный чат по кнопке, группа — командой /start.
export function TelegramConnect({
  venueId,
  bot,
}: {
  venueId: string;
  bot: string;
}) {
  const t = useTranslations("Notifications");
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState<string>();
  const [error, setError] = useState<string>();

  return (
    <div className="grid gap-4" data-testid="telegram-connect">
      <div>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await createTelegramLinkCode(venueId);
              if (r.ok) {
                setCode(r.code);
                setError(undefined);
              } else setError(r.error);
            })
          }
        >
          <Send aria-hidden="true" />
          {t("getLink")}
        </Button>
      </div>
      {error && (
        <p className="text-destructive text-sm">{t(`errors.${error}`)}</p>
      )}
      {code && (
        <div className="bg-muted grid gap-3 rounded-2xl p-4">
          <p className="text-muted-foreground text-sm">{t("linkReady")}</p>
          <a
            href={`https://t.me/${bot}?start=${code}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ className: "w-fit" })}
            data-testid="telegram-link"
          >
            {t("openInTelegram")}
          </a>
          <p className="text-sm">{t("groupHint", { bot: `@${bot}` })}</p>
          <code
            className="bg-card w-fit rounded-lg px-3 py-2 font-mono text-sm select-all"
            data-testid="telegram-command"
          >
            /start@{bot} {code}
          </code>
        </div>
      )}
    </div>
  );
}
