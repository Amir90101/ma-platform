"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { type AuthFormState, resetPassword } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { FormError, FormField } from "./form-field";

export function ResetPasswordForm() {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    resetPassword,
    {},
  );

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormField
        name="password"
        type="password"
        label={t("newPasswordHint", { min: PASSWORD_MIN_LENGTH })}
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        required
      />
      <FormField
        name="confirmPassword"
        type="password"
        label={t("confirmPassword")}
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
        required
      />
      <FormError error={state.error} />
      <Button type="submit" size="lg" disabled={pending}>
        {t("savePassword")}
      </Button>
    </form>
  );
}
