"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { type AuthFormState, register } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { FormError, FormField } from "./form-field";

export function RegisterForm() {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    register,
    {},
  );

  if (state.done) {
    return (
      <p role="status">
        {t("checkEmailToConfirm", { email: state.values?.email ?? "" })}
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormField
        name="fullName"
        label={t("fullName")}
        autoComplete="name"
        defaultValue={state.values?.fullName}
        error={state.fieldErrors?.fullName}
        required
      />
      <FormField
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        required
      />
      <FormField
        name="password"
        type="password"
        label={t("passwordHint", { min: PASSWORD_MIN_LENGTH })}
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        required
      />
      <FormError error={state.error} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("registering") : t("registerSubmit")}
      </Button>
      <p className="text-sm">
        {t("haveAccount")}{" "}
        <Link href="/login" className="hover:underline">
          {t("loginLink")}
        </Link>
      </p>
    </form>
  );
}
