"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { cancelByToken } from "@/app/b/[token]/actions";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// Отмена брони гостем с подтверждением.
export function CancelBooking({ token }: { token: string }) {
  const t = useTranslations("GuestBooking");
  const hydrated = useHydrated();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="grid gap-2">
      {confirming ? (
        <>
          <p className="font-medium">{t("confirmCancel")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              disabled={pending || !hydrated}
              onClick={() =>
                startTransition(async () => {
                  const r = await cancelByToken(token);
                  if (!r.ok) setError(r.error);
                })
              }
            >
              {pending ? t("cancelling") : t("cancelYes")}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              {t("cancelNo")}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button
            variant="outline"
            disabled={!hydrated}
            onClick={() => setConfirming(true)}
          >
            {t("cancel")}
          </Button>
        </div>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}
