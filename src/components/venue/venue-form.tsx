"use client";

import { startTransition, useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { VenueFormState } from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  slugify,
  VENUE_TYPES,
  type VenueType,
  WEEKDAYS,
  type WorkingDay,
} from "@/lib/validation/venue";

export type VenueFormValues = {
  type: VenueType | "";
  name: string;
  slug: string;
  city: string;
  address: string;
  phone: string;
  description: string;
  workingHours: WorkingDay[];
};

const EMPTY: VenueFormValues = {
  type: "",
  name: "",
  slug: "",
  city: "",
  address: "",
  phone: "",
  description: "",
  workingHours: WEEKDAYS.map((weekday) => ({
    weekday,
    open: "10:00",
    close: "22:00",
  })),
};

type Props = {
  action: (
    state: VenueFormState,
    formData: FormData,
  ) => Promise<VenueFormState>;
  mode: "create" | "edit";
  // Первое заведение: заодно спрашиваем название организации.
  askOrgName?: boolean;
  initial?: VenueFormValues;
  siteUrl: string;
};

export function VenueForm({
  action,
  mode,
  askOrgName,
  initial = EMPTY,
  siteUrl,
}: Props) {
  const t = useTranslations("Venue");
  const [state, formAction, pending] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  // Пока владелец не правил slug сам, он следует за названием.
  const [slugTouched, setSlugTouched] = useState(mode === "edit");

  return (
    <form
      className="grid gap-5"
      noValidate
      // Отправка без сброса формы: React очищает её после action={...}.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      {askOrgName && (
        <Field name="orgName" label={t("orgName")} error={errors.orgName}>
          <Input id="orgName" name="orgName" autoComplete="organization" />
          <p className="text-muted-foreground text-sm">{t("orgNameHint")}</p>
        </Field>
      )}

      <Field name="type" label={t("type")} error={errors.type}>
        <NativeSelect
          id="type"
          name="type"
          defaultValue={initial.type}
          className="w-full"
          aria-invalid={errors.type ? true : undefined}
        >
          <NativeSelectOption value="" disabled>
            {t("typePlaceholder")}
          </NativeSelectOption>
          {VENUE_TYPES.map((type) => (
            <NativeSelectOption key={type} value={type}>
              {t(`types.${type}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>

      <Field name="name" label={t("name")} error={errors.name}>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          aria-invalid={errors.name ? true : undefined}
        />
      </Field>

      <Field name="slug" label={t("slug")} error={errors.slug}>
        <Input
          id="slug"
          name="slug"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={errors.slug ? true : undefined}
          aria-describedby="slug-hint"
        />
        <p id="slug-hint" className="text-muted-foreground text-sm break-all">
          {t("slugHint", { url: `${siteUrl}/${slug || "…"}` })}
        </p>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="city" label={t("city")} error={errors.city}>
          <Input id="city" name="city" defaultValue={initial.city} />
        </Field>
        <Field name="phone" label={t("phone")} error={errors.phone}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+7 700 000 00 00"
            defaultValue={initial.phone}
          />
        </Field>
      </div>

      <Field name="address" label={t("address")} error={errors.address}>
        <Input id="address" name="address" defaultValue={initial.address} />
      </Field>

      <Field
        name="description"
        label={t("description")}
        error={errors.description}
      >
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={initial.description}
        />
      </Field>

      <WorkingHoursField initial={initial.workingHours} errors={errors} />

      {state.error && <FormMessage role="alert" error={state.error} />}
      {state.done && !pending && (
        <p role="status" className="text-sm text-emerald-700">
          {t("saved")}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {mode === "create"
          ? pending
            ? t("creating")
            : t("create")
          : pending
            ? t("saving")
            : t("save")}
      </Button>
    </form>
  );
}

function WorkingHoursField({
  initial,
  errors,
}: {
  initial: WorkingDay[];
  errors: Record<string, string>;
}) {
  const t = useTranslations("Venue");
  const tErrors = useTranslations("Venue.errors");
  const [closed, setClosed] = useState(
    () =>
      new Set(
        WEEKDAYS.filter((d) => !initial.some((day) => day.weekday === d)),
      ),
  );

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{t("workingHours")}</legend>
      <p className="text-muted-foreground text-sm">{t("workingHoursHint")}</p>
      {WEEKDAYS.map((d) => {
        const day = initial.find((x) => x.weekday === d);
        const dayName = t(`weekdays.${d}`);
        const isClosed = closed.has(d);
        const error = errors[`hours.${d}`];
        return (
          <div key={d} className="grid gap-1">
            {/* День, открытие – закрытие; «Выходной» справа или под полями на телефоне. */}
            <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 sm:grid-cols-[1.75rem_9rem_auto_9rem_auto]">
              <span className="text-sm font-medium">{dayName}</span>
              <Input
                type="time"
                name={`hours.${d}.open`}
                defaultValue={day?.open ?? "10:00"}
                disabled={isClosed}
                aria-label={`${dayName}, ${t("open")}`}
                aria-invalid={error ? true : undefined}
              />
              <span aria-hidden="true">–</span>
              <Input
                type="time"
                name={`hours.${d}.close`}
                defaultValue={day?.close ?? "22:00"}
                disabled={isClosed}
                aria-label={`${dayName}, ${t("close")}`}
                aria-invalid={error ? true : undefined}
              />
              <label className="col-span-3 col-start-2 flex items-center gap-2 text-sm sm:col-span-1 sm:col-start-auto sm:ml-2">
                <input
                  type="checkbox"
                  name={`hours.${d}.closed`}
                  checked={isClosed}
                  onChange={(e) => {
                    const next = new Set(closed);
                    if (e.target.checked) next.add(d);
                    else next.delete(d);
                    setClosed(next);
                  }}
                  className="size-4"
                />
                {t("dayOff")}
              </label>
            </div>
            {error && (
              <p className="text-destructive text-sm">{tErrors(error)}</p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

function Field({
  name,
  label,
  error,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error && <FormMessage error={error} />}
    </div>
  );
}

function FormMessage({ error, role }: { error: string; role?: "alert" }) {
  const t = useTranslations("Venue.errors");
  return (
    <p role={role} className="text-destructive text-sm">
      {t(error)}
    </p>
  );
}
