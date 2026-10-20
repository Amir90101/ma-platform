"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = React.ComponentProps<"input"> & {
  name: string;
  label: string;
  // Ключ ошибки из Auth.errors.
  error?: string;
};

export function FormField({ name, label, error, ...inputProps }: Props) {
  const t = useTranslations("Auth.errors");
  const errorId = `${name}-error`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-destructive text-sm">
          {t(error)}
        </p>
      )}
    </div>
  );
}

export function FormError({ error }: { error?: string }) {
  const t = useTranslations("Auth.errors");
  if (!error) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {t(error)}
    </p>
  );
}
