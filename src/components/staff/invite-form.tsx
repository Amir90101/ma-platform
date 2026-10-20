"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { InviteFormState } from "@/app/app/staff-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/lib/hooks/use-hydrated";

export function InviteForm({
  action,
}: {
  action: (
    state: InviteFormState,
    formData: FormData,
  ) => Promise<InviteFormState>;
}) {
  const t = useTranslations("Staff");
  const [state, formAction, pending] = useActionState(action, {});
  const hydrated = useHydrated();

  return (
    // После успешного приглашения форма очищается — так и задумано.
    <form action={formAction} className="grid gap-3" noValidate>
      <Label htmlFor="invite-email">{t("email")}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="invite-email"
          name="email"
          type="email"
          autoComplete="off"
          aria-invalid={state.error === "emailInvalid" ? true : undefined}
          className="sm:flex-1"
        />
        <Button type="submit" disabled={pending || !hydrated}>
          {pending ? t("inviting") : t("invite")}
        </Button>
      </div>
      {state.error && (
        <p className="text-destructive text-sm" data-testid="invite-error">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {state.invited && (
        <p role="status" className="text-sm text-emerald-700">
          {state.invited.existing
            ? t("invitedExisting", { email: state.invited.email })
            : t("invitedNew", { email: state.invited.email })}
        </p>
      )}
    </form>
  );
}
