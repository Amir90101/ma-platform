"use client";

import { useState, useTransition } from "react";
import { LogOut, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { logout } from "@/app/(auth)/actions";
import { openShift } from "@/app/app/session-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// Сотрудник вошёл, а смена не открыта: сначала касса, потом работа.
export function ShiftStartGate({
  venueId,
  name,
}: {
  venueId: string;
  name: string;
}) {
  const t = useTranslations("Shift");
  const tw = useTranslations("Work");
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <section
      className="bg-card shadow-card mx-auto grid w-full max-w-md gap-5 rounded-3xl p-6 sm:p-8"
      data-testid="shift-start"
      aria-labelledby="shift-start-title"
    >
      <span
        aria-hidden="true"
        className="bg-secondary text-primary grid size-14 place-items-center rounded-2xl"
      >
        <Wallet className="size-7" />
      </span>
      <div className="grid gap-1">
        <h1 id="shift-start-title" className="text-2xl font-bold">
          {t("startTitle", { name })}
        </h1>
        <p className="text-muted-foreground">{t("startHint")}</p>
      </div>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startTransition(async () => {
            const r = await openShift(venueId, formData);
            if (!r.ok) setError(r.error);
          });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="start-cash">{tw("openingCash")}</Label>
          <Input
            id="start-cash"
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
          {pending ? t("opening") : t("open")}
        </Button>
      </form>
      <form action={logout}>
        <Button type="submit" variant="ghost" className="w-full">
          <LogOut aria-hidden="true" />
          {t("logoutInstead")}
        </Button>
      </form>
    </section>
  );
}
