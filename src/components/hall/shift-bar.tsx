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
      className="bg-card data-[open=false]:border-status-paused/50 data-[open=false]:bg-status-paused-soft flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border px-4 py-3 shadow-xs"
      data-open={!!shift}
      data-testid="shift-bar"
    >
      {closed && (
        <p role="status" className="basis-full text-sm font-medium">
          {tw("shiftResult", {
            expected: closed.expected,
            counted: closed.counted,
            diff: closed.counted - closed.expected,
          })}
        </p>
      )}
      <p className="flex items-center gap-2 text-sm font-medium">
        <span
          aria-hidden="true"
          className={
            (shift ? "bg-status-free" : "bg-status-paused") +
            " size-2.5 shrink-0 rounded-full"
          }
        />
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
