"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BookingPicker,
  type PickedSlot,
  Steps,
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
    <div ref={top} className="grid min-w-0 scroll-mt-4 gap-6">
      {/* Выбор остаётся смонтированным: «Изменить» возвращает к месту. */}
      <div hidden={picked !== null} className="min-w-0">
        {slotGone && (
          <p
            className="bg-secondary text-secondary-foreground mb-4 rounded-xl p-3 text-sm"
            data-testid="slot-gone"
          >
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
          <Steps step="guest" />
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon-lg"
              onClick={() => setPicked(null)}
              aria-label={t("change")}
            >
              <ArrowLeft />
            </Button>
            <div className="min-w-0" data-testid="picked-slot">
              <p className="text-muted-foreground text-xs">
                {t("yourBooking")}
              </p>
              <p className="font-semibold">{summary(picked)}</p>
            </div>
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
