"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { TariffFormState } from "@/app/app/tariff-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEEKDAYS } from "@/lib/validation/venue";
import type { ResourceKind } from "@/lib/venue-types";

type Action = (
  state: TariffFormState,
  formData: FormData,
) => Promise<TariffFormState>;

export type TariffValues = {
  name: string;
  resource_kinds: ResourceKind[];
  price_per_hour: number;
  weekdays: number[];
  time_from: string;
  time_to: string;
  priority: number;
  is_active: boolean;
};

export type PackageValues = {
  name: string;
  resource_kinds: ResourceKind[];
  minutes: number;
  price: number;
  is_active: boolean;
};

// Форма тарифа: новая (initial не задан) или правка существующего.
export function TariffForm({
  action,
  kinds,
  initial,
  idPrefix,
}: {
  action: Action;
  kinds: ResourceKind[];
  initial?: TariffValues;
  idPrefix: string;
}) {
  const t = useTranslations("Tariffs");
  const [state, formAction, pending] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const id = (field: string) => `${idPrefix}-${field}`;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id("name")} label={t("name")} error={errors.name}>
          <Input
            id={id("name")}
            name="name"
            defaultValue={initial?.name}
            maxLength={50}
          />
        </Field>
        <Field
          id={id("price")}
          label={t("pricePerHour")}
          error={errors.price_per_hour}
        >
          <Input
            id={id("price")}
            name="price_per_hour"
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            defaultValue={initial?.price_per_hour}
          />
        </Field>
      </div>

      <KindChecks
        kinds={kinds}
        selected={initial?.resource_kinds ?? kinds.filter((k) => k !== "other")}
        error={errors.resource_kinds}
      />

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("weekdays")}</legend>
        <WeekdayChecks selected={initial?.weekdays ?? [...WEEKDAYS]} />
        <FieldError error={errors.weekdays} />
      </fieldset>

      <div className="grid grid-cols-3 gap-3">
        <Field id={id("from")} label={t("timeFrom")} error={errors.time_from}>
          <Input
            id={id("from")}
            name="time_from"
            type="time"
            defaultValue={initial?.time_from ?? "10:00"}
          />
        </Field>
        <Field id={id("to")} label={t("timeTo")} error={errors.time_to}>
          <Input
            id={id("to")}
            name="time_to"
            type="time"
            defaultValue={initial?.time_to ?? "18:00"}
          />
        </Field>
        <Field
          id={id("priority")}
          label={t("priority")}
          error={errors.priority}
        >
          <Input
            id={id("priority")}
            name="priority"
            type="number"
            step={1}
            defaultValue={initial?.priority ?? 0}
          />
        </Field>
      </div>
      <p className="text-muted-foreground text-xs">{t("priorityHint")}</p>

      <Active defaultChecked={initial?.is_active ?? true} />
      <Submit pending={pending} label={initial ? t("save") : t("add")} />
      {state.error && <FieldError error={state.error} />}
    </form>
  );
}

export function PackageForm({
  action,
  kinds,
  initial,
  idPrefix,
}: {
  action: Action;
  kinds: ResourceKind[];
  initial?: PackageValues;
  idPrefix: string;
}) {
  const t = useTranslations("Tariffs");
  const [state, formAction, pending] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const id = (field: string) => `${idPrefix}-${field}`;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id={id("name")} label={t("name")} error={errors.name}>
          <Input
            id={id("name")}
            name="name"
            defaultValue={initial?.name}
            maxLength={50}
          />
        </Field>
        <Field id={id("minutes")} label={t("minutes")} error={errors.minutes}>
          <Input
            id={id("minutes")}
            name="minutes"
            type="number"
            min={1}
            step={30}
            inputMode="numeric"
            defaultValue={initial?.minutes}
          />
        </Field>
        <Field id={id("price")} label={t("price")} error={errors.price}>
          <Input
            id={id("price")}
            name="price"
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            defaultValue={initial?.price}
          />
        </Field>
      </div>
      <KindChecks
        kinds={kinds}
        selected={initial?.resource_kinds ?? kinds.filter((k) => k !== "other")}
        error={errors.resource_kinds}
      />
      <Active defaultChecked={initial?.is_active ?? true} />
      <Submit pending={pending} label={initial ? t("save") : t("add")} />
      {state.error && <FieldError error={state.error} />}
    </form>
  );
}

function KindChecks({
  kinds,
  selected,
  error,
}: {
  kinds: ResourceKind[];
  selected: ResourceKind[];
  error?: string;
}) {
  const t = useTranslations("Tariffs");
  const tHall = useTranslations("Hall");
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{t("kinds")}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {kinds.map((kind) => (
          <label key={kind} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="resource_kinds"
              value={kind}
              defaultChecked={selected.includes(kind)}
              className="size-4"
            />
            {tHall(`resourceKinds.${kind}`)}
          </label>
        ))}
      </div>
      <FieldError error={error} />
    </fieldset>
  );
}

function WeekdayChecks({ selected }: { selected: number[] }) {
  const tVenue = useTranslations("Venue");
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {WEEKDAYS.map((d) => (
        <label key={d} className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            name="weekdays"
            value={d}
            defaultChecked={selected.includes(d)}
            className="size-4"
          />
          {tVenue(`weekdays.${d}`)}
        </label>
      ))}
    </div>
  );
}

function Active({ defaultChecked }: { defaultChecked: boolean }) {
  const t = useTranslations("Tariffs");
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name="is_active"
        defaultChecked={defaultChecked}
        className="size-4"
      />
      {t("active")}
    </label>
  );
}

function Submit({ pending, label }: { pending: boolean; label: string }) {
  const t = useTranslations("Tariffs");
  return (
    <div>
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : label}
      </Button>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError error={error} />
    </div>
  );
}

function FieldError({ error }: { error?: string }) {
  const t = useTranslations("Tariffs.errors");
  if (!error) return null;
  return <p className="text-destructive text-sm">{t(error)}</p>;
}
