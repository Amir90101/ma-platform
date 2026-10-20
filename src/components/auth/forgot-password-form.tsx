"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { type AuthFormState, forgotPassword } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FormError, FormField } from "./form-field";

export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    forgotPassword,
    {},
  );

  if (state.done) {
    return (
      <p role="status">
        {t("resetEmailSent", { email: state.values?.email ?? "" })}
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormField
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        required
      />
      <FormError error={state.error} />
      <Button type="submit" size="lg" disabled={pending}>
        {t("sendResetLink")}
      </Button>
      <Link href="/login" className="text-sm hover:underline">
        {t("backToLogin")}
      </Link>
    </form>
  );
}
