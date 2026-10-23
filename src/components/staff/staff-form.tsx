"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { StaffFormState } from "@/app/app/staff-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/lib/hooks/use-hydrated";

type Action = (
  state: StaffFormState,
  formData: FormData,
) => Promise<StaffFormState>;

function FieldError({ error }: { error?: string }) {
  const t = useTranslations("Staff.errors");
  return error ? <p className="text-destructive text-sm">{t(error)}</p> : null;
}

// Новый сотрудник: имя, логин и пароль задаёт владелец.
export function StaffForm({ action }: { action: Action }) {
  const t = useTranslations("Staff");
  const [state, formAction, pending] = useActionState(action, {});
  const hydrated = useHydrated();
  const errors = state.fieldErrors ?? {};

  return (
    // После создания форма очищается — так и задумано.
    <form action={formAction} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="staff-name">{t("fullName")}</Label>
          <Input
            id="staff-name"
            name="fullName"
            autoComplete="off"
            aria-invalid={errors.fullName ? true : undefined}
          />
          <FieldError error={errors.fullName} />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="staff-login">{t("login")}</Label>
          <Input
            id="staff-login"
            name="login"
            autoComplete="off"
            autoCapitalize="none"
            placeholder="aigerim"
            aria-invalid={errors.login ? true : undefined}
          />
          <FieldError error={errors.login} />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="staff-password">{t("password")}</Label>
          <Input
            id="staff-password"
            name="password"
            type="text"
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
          />
          <FieldError error={errors.password} />
        </div>
      </div>
      <p className="text-muted-foreground text-sm">{t("loginHint")}</p>
      <div>
        <Button type="submit" disabled={pending || !hydrated}>
          {pending ? t("creating") : t("create")}
        </Button>
      </div>
      {state.error && (
        <p className="text-destructive text-sm" data-testid="staff-error">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {state.created && (
        <p role="status" className="text-success text-sm font-medium">
          {t("created", { login: state.created.login })}
        </p>
      )}
    </form>
  );
}

// Новый пароль сотруднику — раскрывается по кнопке в списке.
export function StaffPasswordForm({
  action,
  login,
}: {
  action: Action;
  login: string;
}) {
  const t = useTranslations("Staff");
  const [state, formAction, pending] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  return (
    <details className="group">
      <summary className="text-primary w-fit text-sm font-medium">
        {t("changePassword")}
      </summary>
      <form action={formAction} className="mt-2 flex flex-wrap gap-2">
        <Input
          name="password"
          type="text"
          autoComplete="new-password"
          aria-label={t("newPasswordFor", { login })}
          aria-invalid={errors.password ? true : undefined}
          className="w-48"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {t("savePassword")}
        </Button>
        <div className="basis-full">
          <FieldError error={errors.password ?? state.error} />
          {state.done && (
            <p role="status" className="text-success text-sm">
              {t("passwordSaved")}
            </p>
          )}
        </div>
      </form>
    </details>
  );
}
