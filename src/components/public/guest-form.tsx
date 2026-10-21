"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import type {
  PublicBookingInput,
  PublicBookingResponse,
} from "@/lib/validation/public-booking";
import type { PickedSlot } from "./booking-picker";
import { Turnstile } from "./turnstile";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export type BookingDone = Extract<PublicBookingResponse, { ok: true }>;

// Данные гостя для выбранного окна. Бронь создаёт Route Handler
// /api/public-booking после проверки Turnstile.
export function GuestForm({
  slot,
  noShowAfterMin,
  onDone,
  onSlotGone,
}: {
  slot: PickedSlot;
  noShowAfterMin: number;
  onDone: (done: BookingDone) => void;
  // Окно успели занять: выбор сбрасывается, окна перечитываются.
  onSlotGone: () => void;
}) {
  const t = useTranslations("PublicBooking");
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [token, setToken] = useState("");
  // Токен Turnstile одноразовый: после попытки виджет пересоздаём.
  const [attempt, setAttempt] = useState(0);

  function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const guests = String(data.get("guests") ?? "").trim();
    // Согласие проверяет сервер: без галочки придёт consentRequired.
    const body: Omit<PublicBookingInput, "consent"> & { consent: boolean } = {
      resourceId: slot.resourceId,
      startsAt: slot.startsAt,
      durationMin: slot.durationMin,
      name: String(data.get("name") ?? ""),
      phone: String(data.get("phone") ?? ""),
      guests: guests ? Number(guests) : null,
      comment: String(data.get("comment") ?? ""),
      consent: data.get("consent") === "on",
      packageId: slot.packageId,
      turnstileToken: token,
    };
    if (SITE_KEY && !token) return setError("captchaRequired");
    startTransition(async () => {
      let result: PublicBookingResponse;
      try {
        const res = await fetch("/api/public-booking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        result = (await res.json()) as PublicBookingResponse;
      } catch {
        result = { ok: false, error: "unknown" };
      }
      if (result.ok) return onDone(result);
      setError(result.error);
      setToken("");
      setAttempt((n) => n + 1);
      if (result.error === "slot_unavailable") onSlotGone();
    });
  }

  return (
    <form
      className="grid gap-3"
      data-testid="guest-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
    >
      <h3 className="font-medium">{t("formTitle")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="guest-name">{t("name")}</Label>
          <Input
            id="guest-name"
            name="name"
            autoComplete="given-name"
            maxLength={100}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="guest-phone">{t("phone")}</Label>
          <Input
            id="guest-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+7 700 000 00 00"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="guest-guests">{t("guests")}</Label>
          <Input
            id="guest-guests"
            name="guests"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="guest-comment">{t("comment")}</Label>
        <Textarea
          id="guest-comment"
          name="comment"
          rows={2}
          maxLength={500}
          placeholder={t("commentPlaceholder")}
        />
      </div>
      <p className="text-muted-foreground text-sm">
        {t("rules", { minutes: noShowAfterMin })}
      </p>
      <label htmlFor="guest-consent" className="flex items-start gap-2 text-sm">
        <input
          id="guest-consent"
          type="checkbox"
          name="consent"
          required
          className="mt-0.5 size-4"
        />
        <span>{t("consent")}</span>
      </label>
      {SITE_KEY && (
        <Turnstile key={attempt} siteKey={SITE_KEY} onToken={setToken} />
      )}
      {error && (
        <p className="text-destructive text-sm" data-testid="guest-error">
          {t(`errors.${error}`)}
        </p>
      )}
      <div>
        <Button
          type="submit"
          size="lg"
          disabled={pending || !hydrated || (Boolean(SITE_KEY) && !token)}
        >
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}

// Бронь создана: код и личная ссылка гостя.
export function BookingDonePanel({
  done,
  summary,
  onAnother,
}: {
  done: BookingDone;
  summary: string;
  onAnother: () => void;
}) {
  const t = useTranslations("PublicBooking");
  const [copied, setCopied] = useState(false);
  const path = `/b/${done.token}`;
  return (
    <div
      className="grid gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950"
      data-testid="booking-done"
      role="status"
    >
      <h3 className="text-lg font-semibold">{t("doneTitle")}</h3>
      <p className="font-medium">{summary}</p>
      <p data-testid="booking-code">{t("doneCode", { code: done.code })}</p>
      <p className="text-sm">{t("doneLink")}</p>
      <div className="flex flex-wrap gap-2">
        <Link href={path} className={buttonVariants()}>
          {t("openBooking")}
        </Link>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard?.writeText(
              `${window.location.origin}${path}`,
            );
            setCopied(true);
          }}
        >
          {copied ? t("copied") : t("copyLink")}
        </Button>
        <Button type="button" variant="ghost" onClick={onAnother}>
          {t("bookAnother")}
        </Button>
      </div>
    </div>
  );
}
