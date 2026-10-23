"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { type AuthFormState, login } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FormError, FormField } from "./form-field";

export function LoginForm() {
  const t = useTranslations("Auth");
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    login,
    {
      error: searchParams.get("error") ?? undefined,
    },
  );

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={searchParams.get("next") ?? ""} />
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
        label={t("password")}
        autoComplete="current-password"
        error={state.fieldErrors?.password}
        required
      />
      <FormError error={state.error} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("loggingIn") : t("loginSubmit")}
      </Button>
      <div className="flex justify-between text-sm">
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:underline"
        >
          {t("forgotLink")}
        </Link>
      </div>
    </form>
  );
}
