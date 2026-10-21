"use client";

import { startTransition, useActionState } from "react";
import { useTranslations } from "next-intl";
import type { BookingRulesState } from "@/app/app/booking-rules-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import type { BookingRules } from "@/lib/validation/booking-rules";

const NUMBER_FIELDS = [
  { name: "min_duration_min", label: "minDuration" },
  { name: "buffer_min", label: "buffer", hint: "bufferHint" },
  { name: "min_lead_min", label: "lead" },
  { name: "max_days_ahead", label: "daysAhead" },
  { name: "no_show_after_min", label: "noShow", hint: "noShowHint" },
] as const;

export function BookingRulesForm({
  action,
  initial,
}: {
  action: (
    state: BookingRulesState,
    formData: FormData,
  ) => Promise<BookingRulesState>;
  initial: BookingRules;
}) {
  const t = useTranslations("BookingRules");
  const hydrated = useHydrated();
  const [state, formAction, pending] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const error = (name: string) =>
    errors[name] && (
      <p className="text-destructive text-sm" id={`${name}-error`}>
        {t(`errors.${errors[name]}`)}
      </p>
    );

  return (
    <form
      className="grid gap-4"
      noValidate
      data-testid="booking-rules-form"
      // Отправка без сброса формы: React очищает её после action={...}.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <label
        htmlFor="online_booking_enabled"
        className="flex items-start gap-2"
      >
        <input
          id="online_booking_enabled"
          name="online_booking_enabled"
          type="checkbox"
          defaultChecked={initial.online_booking_enabled}
          className="mt-1 size-4"
        />
        <span className="grid gap-0.5">
          <span className="font-medium">{t("onlineEnabled")}</span>
          <span className="text-muted-foreground text-sm">
            {t("onlineEnabledHint")}
          </span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="slot_step_min">{t("slotStep")}</Label>
          <NativeSelect
            id="slot_step_min"
            name="slot_step_min"
            defaultValue={String(initial.slot_step_min)}
            className="w-full"
          >
            {[15, 30, 60].map((m) => (
              <NativeSelectOption key={m} value={m}>
                {t("minutes", { minutes: m })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-muted-foreground text-xs">{t("slotStepHint")}</p>
          {error("slot_step_min")}
        </div>
        {NUMBER_FIELDS.map((f) => (
          <div key={f.name} className="grid gap-1.5">
            <Label htmlFor={f.name}>{t(f.label)}</Label>
            <Input
              id={f.name}
              name={f.name}
              type="number"
              inputMode="numeric"
              defaultValue={initial[f.name]}
              aria-invalid={errors[f.name] ? true : undefined}
              aria-describedby={errors[f.name] ? `${f.name}-error` : undefined}
            />
            {"hint" in f && (
              <p className="text-muted-foreground text-xs">{t(f.hint)}</p>
            )}
            {error(f.name)}
          </div>
        ))}
      </div>

      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {state.done && !pending && (
        <p className="text-sm text-emerald-700" data-testid="rules-saved">
          {t("saved")}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending || !hydrated}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
