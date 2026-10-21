"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  type BookingActionResult,
  createManualBooking,
} from "@/app/app/booking-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { type FeedResource, formatTime } from "./booking-feed";

// Бронь по звонку на выбранный день. Пересечение отклоняет база, форма
// показывает, с какой бронью.
export function BookingForm({
  venueId,
  date,
  timezone,
  resources,
}: {
  venueId: string;
  date: string;
  timezone: string;
  resources: FeedResource[];
}) {
  const t = useTranslations("Bookings");
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BookingActionResult>();
  const [created, setCreated] = useState<string>();

  function message(r: BookingActionResult) {
    if (r.ok) return null;
    if (r.error === "booking_overlap" && r.conflict) {
      const range = {
        from: formatTime(r.conflict.startsAt, timezone),
        to: formatTime(r.conflict.endsAt, timezone),
      };
      return r.conflict.customerName
        ? t("conflict", { name: r.conflict.customerName, ...range })
        : t("conflictNoName", range);
    }
    return t(`errors.${r.error}`);
  }

  return (
    <Card className="xl:sticky xl:top-24">
      <CardHeader>
        <CardTitle>{t("newTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          data-testid="booking-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const formData = new FormData(form);
            startTransition(async () => {
              const r = await createManualBooking(venueId, date, formData);
              setResult(r);
              if (r.ok) {
                const resource = resources.find(
                  (x) => x.id === formData.get("resource_id"),
                );
                setCreated(
                  t("created", {
                    resource: resource?.name ?? "",
                    from: String(formData.get("start")),
                    to: String(formData.get("end")),
                  }),
                );
                form.reset();
              } else {
                setCreated(undefined);
              }
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-2">
            <div className="grid gap-1.5 xl:col-span-2">
              <Label htmlFor="booking-resource">{t("resource")}</Label>
              <NativeSelect
                id="booking-resource"
                name="resource_id"
                className="w-full"
                required
              >
                {resources.map((r) => (
                  <NativeSelectOption key={r.id} value={r.id}>
                    {r.hallName ? `${r.name} · ${r.hallName}` : r.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="booking-start">{t("start")}</Label>
              <Input id="booking-start" name="start" type="time" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="booking-end">{t("end")}</Label>
              <Input id="booking-end" name="end" type="time" required />
            </div>
          </div>
          <p className="text-muted-foreground text-xs">{t("endHint")}</p>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="booking-phone">{t("guestPhone")}</Label>
              <Input
                id="booking-phone"
                name="phone"
                type="tel"
                autoComplete="off"
                placeholder="+7 700 000 00 00"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="booking-name">{t("guestName")}</Label>
              <Input
                id="booking-name"
                name="name"
                autoComplete="off"
                maxLength={100}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="booking-guests">{t("guests")}</Label>
              <Input
                id="booking-guests"
                name="guests"
                type="number"
                min={1}
                max={100}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="booking-comment">{t("comment")}</Label>
            <Textarea
              id="booking-comment"
              name="comment"
              maxLength={500}
              rows={2}
            />
          </div>
          {result && !result.ok && (
            <p
              className="text-destructive text-sm"
              data-testid="booking-form-error"
            >
              {message(result)}
            </p>
          )}
          {created && (
            <p
              className="text-sm text-emerald-700"
              data-testid="booking-created"
            >
              {created}
            </p>
          )}
          <div>
            <Button type="submit" disabled={pending || !hydrated}>
              {pending ? t("creating") : t("create")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
