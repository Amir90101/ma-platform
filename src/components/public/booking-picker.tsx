"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { getPublicAvailability, type PublicSlot } from "@/app/[slug]/actions";
import type { ItemStatus } from "@/components/hall/hall-canvas";
import type { EditorItem } from "@/components/hall/hall-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { durationOptions } from "@/lib/public-booking";
import { cn } from "@/lib/utils";
import { addDays, todayIn } from "@/lib/venue-time";
import type { PublicHall, PublicPackage } from "./types";

const HallCanvas = dynamic(() => import("@/components/hall/hall-canvas"), {
  ssr: false,
  loading: () => <div className="bg-muted/30 size-full animate-pulse" />,
});

// «Стол 2 · Завтра · 12:00–13:00» для выбранного окна.
export function usePickedSummary(today: string, timezone: string) {
  const t = useTranslations("PublicBooking");
  const time = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(iso));
  return (picked: PickedSlot) =>
    (picked.packageName
      ? t("selectedTariff", {
          name: picked.packageName,
          price: (picked.price ?? 0).toLocaleString("ru-RU"),
        }) + " · "
      : "") +
    t("selected", {
      resource: picked.resourceName,
      date: dayLabelOf(picked.date, today, t),
      from: time(picked.startsAt),
      to: time(
        new Date(
          Date.parse(picked.startsAt) + picked.durationMin * 60_000,
        ).toISOString(),
      ),
    });
}

function dayLabelOf(
  d: string,
  today: string,
  t: (key: "today" | "tomorrow") => string,
) {
  return d === today
    ? t("today")
    : d === addDays(today, 1)
      ? t("tomorrow")
      : new Intl.DateTimeFormat("ru-RU", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${d}T00:00:00Z`));
}

export type PickedSlot = {
  resourceId: string;
  resourceName: string;
  date: string;
  startsAt: string;
  durationMin: number;
  // Тариф-пакет: задаёт длительность и цену брони.
  packageId: string | null;
  packageName: string | null;
  price: number | null;
};

const OWN_TIME = "own";

// Число дат кнопками; дальние даты — полем даты.
const DATE_CHIPS = 7;

// Выбор даты, длительности, места и времени. Окна считает база
// (get_availability), страница только показывает их.
export function BookingPicker({
  venueId,
  timezone,
  today,
  maxDaysAhead,
  minDuration,
  slotStep,
  halls,
  packages,
  reloadKey,
  onPick,
}: {
  venueId: string;
  timezone: string;
  today: string;
  maxDaysAhead: number;
  minDuration: number;
  slotStep: number;
  halls: PublicHall[];
  packages: PublicPackage[];
  // Смена значения перечитывает окна (например, окно успели занять).
  reloadKey: number;
  onPick: (slot: PickedSlot | null) => void;
}) {
  const t = useTranslations("PublicBooking");
  const durations = durationOptions(minDuration, slotStep);
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState(durations[0]);
  // Тарифы, которые можно забронировать онлайн: время укладывается в сетку
  // окон и есть место нужного вида.
  const tariffs = packages.filter(
    (p) =>
      p.minutes >= minDuration &&
      p.minutes % slotStep === 0 &&
      halls.some((h) =>
        h.resources.some(
          (r) => r.bookable_online && p.resource_kinds.includes(r.kind),
        ),
      ),
  );
  const [tariffId, setTariffId] = useState(tariffs[0]?.id ?? OWN_TIME);
  const tariff = tariffs.find((p) => p.id === tariffId) ?? null;
  const minutes = tariff ? tariff.minutes : duration;
  const [view, setView] = useState<"map" | "list">("map");
  const [hallId, setHallId] = useState(halls[0]?.id);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [slots, setSlots] = useState<PublicSlot[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const request = useRef(0);

  const load = useCallback(() => {
    const id = ++request.current;
    startTransition(async () => {
      const r = await getPublicAvailability(venueId, date, minutes);
      // Ответ на устаревший запрос (дату уже сменили) не показываем.
      if (id !== request.current) return;
      setFailed(!r.ok);
      setSlots(r.ok ? r.slots : null);
    });
    // reloadKey — только повод перечитать.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, date, minutes, reloadKey]);

  useEffect(load, [load]);
  // Вернулись на вкладку — окна могли занять, перечитываем.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // С тарифом показываем только места тех видов, к которым он подходит.
  const resources = halls
    .flatMap((h) => h.resources)
    .filter((r) => !tariff || tariff.resource_kinds.includes(r.kind));
  const allowed = new Set(resources.map((r) => r.id));
  const byResource = Map.groupBy(
    (slots ?? []).filter((s) => allowed.has(s.resourceId)),
    (s) => s.resourceId,
  );
  const hall = halls.find((h) => h.id === hallId) ?? halls[0];
  const lastDate = addDays(today, maxDaysAhead);
  const chips = Array.from(
    { length: Math.min(DATE_CHIPS, maxDaysAhead + 1) },
    (_, i) => addDays(today, i),
  );

  const dayLabel = (d: string) => dayLabelOf(d, today, t);
  const durationLabel = (m: number) =>
    t("durationValue", { hours: Math.floor(m / 60), minutes: m % 60 }).trim();

  function pick(slot: PublicSlot) {
    const resource = resources.find((r) => r.id === slot.resourceId);
    onPick({
      resourceId: slot.resourceId,
      resourceName: resource?.name ?? "",
      date,
      startsAt: slot.startsAt,
      durationMin: minutes,
      packageId: tariff?.id ?? null,
      packageName: tariff?.name ?? null,
      price: tariff?.price ?? null,
    });
  }

  // Смена даты или длительности сбрасывает выбор: окна уже другие.
  function change(next: () => void) {
    next();
    setResourceId(null);
    onPick(null);
  }

  const selected = resources.find((r) => r.id === resourceId);
  const statuses: Record<string, ItemStatus> = Object.fromEntries(
    resources.map((r) => [
      r.id,
      { tone: byResource.has(r.id) ? "free" : "off" } as ItemStatus,
    ]),
  );

  return (
    <div className="grid gap-4" data-testid="booking-picker">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("date")}</legend>
        <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {chips.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === date}
              onClick={() => change(() => setDate(d))}
              className="bg-card hover:bg-muted aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:border-primary shrink-0 rounded-full border px-4 py-2 text-sm font-medium first-letter:uppercase"
            >
              {dayLabel(d)}
            </button>
          ))}
        </div>
        {maxDaysAhead + 1 > DATE_CHIPS && (
          <div className="flex items-center gap-2">
            <Label
              htmlFor="public-date"
              className="text-muted-foreground text-xs"
            >
              {t("otherDate")}
            </Label>
            <Input
              id="public-date"
              type="date"
              min={today}
              max={lastDate}
              value={date}
              onChange={(e) => {
                const d = e.target.value;
                if (d >= today && d <= lastDate) change(() => setDate(d));
              }}
              className="h-8 w-auto"
            />
          </div>
        )}
      </fieldset>

      {tariffs.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{t("tariff")}</legend>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {[...tariffs, null].map((p) => {
              const value = p?.id ?? OWN_TIME;
              return (
                <label
                  key={value}
                  className="bg-card has-checked:border-primary has-checked:bg-secondary has-checked:ring-primary hover:bg-muted/60 relative grid cursor-pointer gap-1 rounded-xl border p-4 has-checked:ring-1"
                >
                  <input
                    type="radio"
                    name="public-tariff"
                    value={value}
                    checked={tariffId === value}
                    onChange={() => change(() => setTariffId(value))}
                    className="accent-primary absolute top-3 right-3 size-4"
                  />
                  <span className="font-semibold">
                    {p ? p.name : t("ownTime")}
                  </span>
                  {p ? (
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-muted-foreground text-sm">
                        {durationLabel(p.minutes)}
                      </span>
                      <span className="text-lg font-semibold tabular-nums">
                        {t("price", { price: p.price.toLocaleString("ru-RU") })}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      {t("ownTimeHint")}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {!tariff && (
        <div className="grid gap-1.5">
          <Label htmlFor="public-duration">{t("duration")}</Label>
          <NativeSelect
            id="public-duration"
            value={duration}
            onChange={(e) => change(() => setDuration(Number(e.target.value)))}
            className="w-full sm:w-60"
          >
            {durations.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {durationLabel(m)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="bg-muted flex w-fit gap-1 rounded-lg p-1" role="tablist">
        {(["map", "list"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className="text-muted-foreground aria-selected:bg-card aria-selected:text-foreground rounded-md px-3 py-1.5 text-sm font-medium aria-selected:shadow-xs"
          >
            {v === "map" ? t("viewMap") : t("viewList")}
          </button>
        ))}
      </div>

      <div
        className={cn("grid gap-3", pending && "opacity-60")}
        aria-busy={pending}
        data-testid="availability"
        data-state={pending || !slots ? "loading" : "ready"}
      >
        {failed ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <p className="text-destructive">{t("loadError")}</p>
            <Button variant="outline" size="sm" onClick={load}>
              {t("retry")}
            </Button>
          </div>
        ) : slots === null ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : slots.length === 0 ? (
          <p className="text-sm">{t("noSlots")}</p>
        ) : view === "map" && hall ? (
          <>
            {halls.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {halls.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    aria-pressed={h.id === hall.id}
                    onClick={() => setHallId(h.id)}
                    className="hover:bg-muted aria-pressed:bg-primary aria-pressed:text-primary-foreground rounded-md px-3 py-1.5 text-sm"
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            )}
            <p className="text-muted-foreground text-xs">{t("mapHint")}</p>
            <div
              className="relative w-full overflow-hidden rounded-lg border"
              style={{ aspectRatio: `${hall.width} / ${hall.height}` }}
            >
              <HallCanvas
                hall={hall}
                items={hallItems(hall)}
                selectedKey={resourceId}
                editable={false}
                statuses={statuses}
                onSelect={(key) =>
                  setResourceId(
                    key && resources.some((r) => r.id === key) ? key : null,
                  )
                }
                onChange={() => {}}
              />
            </div>
            {selected ? (
              <SlotChips
                title={
                  byResource.has(selected.id)
                    ? t("resourceSlots", { name: selected.name })
                    : t("resourceBusy", { name: selected.name })
                }
                slots={byResource.get(selected.id) ?? []}
                date={date}
                timezone={timezone}
                onPick={pick}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("pickResource")}
              </p>
            )}
          </>
        ) : (
          <ul className="grid gap-3" data-testid="slot-list">
            {resources.map((r) => (
              <li key={r.id} data-resource={r.name} data-testid="slot-resource">
                <SlotChips
                  title={r.name}
                  empty={t("noSlotsResource")}
                  slots={byResource.get(r.id) ?? []}
                  date={date}
                  timezone={timezone}
                  onPick={pick}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SlotChips({
  title,
  empty,
  slots,
  date,
  timezone,
  onPick,
}: {
  title: string;
  empty?: string;
  slots: PublicSlot[];
  date: string;
  timezone: string;
  onPick: (slot: PublicSlot) => void;
}) {
  const t = useTranslations("PublicBooking");
  const format = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(iso));
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{title}</p>
      {slots.length === 0 ? (
        empty && <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {slots.map((s) => (
            <button
              key={s.startsAt}
              type="button"
              onClick={() => onPick(s)}
              className="bg-card hover:border-primary hover:bg-primary hover:text-primary-foreground min-w-16 rounded-lg border px-3 py-2 text-sm font-medium tabular-nums transition-colors"
            >
              {format(s.startsAt)}
              {/* Ночное окно — уже следующие сутки рабочего дня. */}
              {todayIn(timezone, new Date(s.startsAt)) !== date && (
                <span className="text-muted-foreground"> {t("night")}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function hallItems(hall: PublicHall): EditorItem[] {
  return [
    ...hall.objects.map((o) => ({ ...o, type: "object" as const, key: o.id })),
    ...hall.resources.map((r) => ({
      ...r,
      type: "resource" as const,
      key: r.id,
      is_active: true,
    })),
  ];
}
