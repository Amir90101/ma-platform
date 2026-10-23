"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { logout } from "@/app/(auth)/actions";
import { type CloseShiftResult, endShift } from "@/app/app/session-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";

// Конец рабочего дня сотрудника: пересчёт кассы, итог смены, выход.
export function ShiftEndForm({
  venueId,
  shiftId,
}: {
  venueId: string;
  shiftId: string | null;
}) {
  const t = useTranslations("Shift");
  const tw = useTranslations("Work");
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [closed, setClosed] =
    useState<Extract<CloseShiftResult, { ok: true }>>();

  const logoutButton = (
    <form action={logout}>
      <Button type="submit" size="lg" className="w-full">
        <LogOut aria-hidden="true" />
        {t("logout")}
      </Button>
    </form>
  );

  if (closed || !shiftId) {
    const diff = closed ? closed.counted - closed.expected : 0;
    return (
      <div className="grid gap-5" data-testid="shift-end-result">
        {closed ? (
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["expected", closed.expected],
                ["counted", closed.counted],
                ["diff", diff],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="bg-muted grid gap-1 rounded-2xl p-3">
                <dt className="text-muted-foreground text-xs">{t(key)}</dt>
                <dd
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    key === "diff" && value < 0 && "text-destructive",
                  )}
                >
                  {t("money", { amount: value.toLocaleString("ru-RU") })}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-muted-foreground">{t("noOpenShift")}</p>
        )}
        {logoutButton}
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startTransition(async () => {
            const r = await endShift(shiftId, formData);
            if (r.ok) setClosed(r);
            else setError(r.error);
          });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="end-cash">{tw("closingCash")}</Label>
          <Input
            id="end-cash"
            name="cash"
            type="number"
            min={0}
            inputMode="numeric"
            required
            autoFocus
            className="h-14 text-2xl font-bold"
          />
        </div>
        {error && (
          <p className="text-destructive text-sm">{tw(`errors.${error}`)}</p>
        )}
        <Button type="submit" size="lg" disabled={pending || !hydrated}>
          {pending ? t("closing") : t("close")}
        </Button>
      </form>
      <div className="grid gap-2 border-t pt-4">
        <p className="text-muted-foreground text-sm">{t("leaveOpenHint")}</p>
        <form action={logout}>
          <Button type="submit" variant="outline" className="w-full">
            {t("logoutKeepOpen")}
          </Button>
        </form>
        <Link
          href={`/app/${venueId}/hall`}
          className={buttonVariants({ variant: "ghost" })}
        >
          {t("backToWork")}
        </Link>
      </div>
    </div>
  );
}
