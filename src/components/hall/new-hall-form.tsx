"use client";

import { useTranslations } from "next-intl";
import { createHall } from "@/app/app/hall-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewHallForm({
  venueId,
  defaultName,
  confirmLeave,
}: {
  venueId: string;
  defaultName?: string;
  // Есть несохранённые изменения: спросить перед переходом в новый зал.
  confirmLeave?: () => boolean;
}) {
  const t = useTranslations("Hall");
  return (
    <form
      action={createHall.bind(null, venueId)}
      onSubmit={(e) => {
        if (confirmLeave && !confirmLeave()) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <Input
        name="name"
        defaultValue={defaultName}
        placeholder={t("newHallPlaceholder")}
        aria-label={t("newHallName")}
        maxLength={50}
        required
        className="w-48"
      />
      <Button type="submit" variant="outline">
        {t("createHall")}
      </Button>
    </form>
  );
}
