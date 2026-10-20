"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  type CloseShiftResult,
  closeShift,
  openShift,
} from "@/app/app/session-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/lib/hooks/use-hydrated";

export type OpenShift = { id: string; openedAt: string; openingCash: number };

// Смена: без неё запускать столы можно, принимать оплату — нет.
export function ShiftBar({
  venueId,
  shift,
  timezone,
}: {
  venueId: string;
  shift: OpenShift | null;
  timezone: string;
}) {
  const tw = useTranslations("Work");
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [closed, setClosed] =
    useState<Extract<CloseShiftResult, { ok: true }>>();
  const time = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(iso));

  return (
    <section
      className="grid gap-2 rounded-lg border p-3 data-[open=false]:border-amber-400 data-[open=false]:bg-amber-50"
      data-open={!!shift}
      data-testid="shift-bar"
    >
      {closed && (
        <p role="status" className="text-sm font-medium">
          {tw("shiftResult", {
            expected: closed.expected,
            counted: closed.counted,
            diff: closed.counted - closed.expected,
          })}
        </p>
      )}
      <p className="text-sm">
        {shift
          ? tw("shiftOpen", {
              time: time(shift.openedAt),
              cash: shift.openingCash,
            })
          : tw("shiftClosed")}
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const formData = new FormData(form);
          startTransition(async () => {
            if (shift) {
              const r = await closeShift(shift.id, formData);
              if (r.ok) {
                setClosed(r);
                setError(undefined);
                form.reset();
              } else setError(r.error);
            } else {
              const r = await openShift(venueId, formData);
              if (r.ok) {
                setClosed(undefined);
                setError(undefined);
                form.reset();
              } else setError(r.error);
            }
          });
        }}
      >
        <div className="grid gap-1">
          <Label htmlFor="shift-cash" className="text-xs">
            {shift ? tw("closingCash") : tw("openingCash")}
          </Label>
          <Input
            id="shift-cash"
            name="cash"
            type="number"
            min={0}
            inputMode="numeric"
            className="w-40"
          />
        </div>
        <Button
          type="submit"
          variant={shift ? "outline" : "default"}
          disabled={pending || !hydrated}
        >
          {shift ? tw("closeShift") : tw("openShift")}
        </Button>
      </form>
      {error && (
        <p className="text-destructive text-sm">{tw(`errors.${error}`)}</p>
      )}
    </section>
  );
}
