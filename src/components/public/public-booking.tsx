"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  BookingPicker,
  type PickedSlot,
  usePickedSummary,
} from "./booking-picker";
import { BookingDonePanel, type BookingDone, GuestForm } from "./guest-form";
import type { PublicHall, PublicPackage } from "./types";

// Онлайн-бронь на публичной странице: выбор окна, форма гостя, готово.
export function PublicBooking({
  noShowAfterMin,
  ...props
}: {
  venueId: string;
  timezone: string;
  today: string;
  maxDaysAhead: number;
  minDuration: number;
  slotStep: number;
  noShowAfterMin: number;
  halls: PublicHall[];
  packages: PublicPackage[];
}) {
  const t = useTranslations("PublicBooking");
  const summary = usePickedSummary(props.today, props.timezone);
  const [picked, setPicked] = useState<PickedSlot | null>(null);
  const [done, setDone] = useState<{
    slot: PickedSlot;
    booking: BookingDone;
  } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Окно заняли, пока гость заполнял форму.
  const [slotGone, setSlotGone] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  // Выбор окна и готовая бронь меняют высоту блока: показываем его начало,
  // иначе на телефоне форма оказывается выше экрана.
  useEffect(() => {
    if (picked || done) {
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [picked, done]);

  if (done) {
    return (
      <div ref={top} className="scroll-mt-4">
        <BookingDonePanel
          done={done.booking}
          summary={summary(done.slot)}
          onAnother={() => {
            setDone(null);
            setPicked(null);
            setReloadKey((n) => n + 1);
          }}
        />
      </div>
    );
  }

  return (
    <div ref={top} className="grid scroll-mt-4 gap-3">
      {/* Выбор остаётся смонтированным: «Изменить» возвращает дату и длительность. */}
      <div hidden={picked !== null}>
        {slotGone && (
          <p className="text-destructive mb-3 text-sm" data-testid="slot-gone">
            {t("errors.slot_unavailable")}
          </p>
        )}
        <BookingPicker
          {...props}
          reloadKey={reloadKey}
          onPick={(slot) => {
            setSlotGone(false);
            setPicked(slot);
          }}
        />
      </div>
      {picked && (
        <>
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
            data-testid="picked-slot"
          >
            <p className="font-medium">{summary(picked)}</p>
            <Button variant="outline" size="sm" onClick={() => setPicked(null)}>
              {t("change")}
            </Button>
          </div>
          <GuestForm
            key={`${picked.resourceId}-${picked.startsAt}`}
            slot={picked}
            noShowAfterMin={noShowAfterMin}
            onDone={(booking) => setDone({ slot: picked, booking })}
            onSlotGone={() => {
              setSlotGone(true);
              setPicked(null);
              setReloadKey((n) => n + 1);
            }}
          />
        </>
      )}
    </div>
  );
}
