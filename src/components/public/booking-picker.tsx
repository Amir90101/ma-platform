"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { getPublicAvailability, type PublicSlot } from "@/app/[slug]/actions";
import type { ItemStatus } from "@/components/hall/hall-canvas";
import type { EditorItem } from "@/components/hall/hall-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fitToItems } from "@/lib/hall/fit";
import { durationOptions } from "@/lib/public-booking";
import { cn } from "@/lib/utils";
import { addDays, isoWeekday, todayIn } from "@/lib/venue-time";
import type { PublicHall, PublicPackage } from "./types";

const HallCanvas = dynamic(() => import("@/components/hall/hall-canvas"), {
  ssr: false,
  loading: () => <div className="bg-muted size-full animate-pulse" />,
});

function useTimeFormat(timezone: string) {
  return (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(iso));
}

const endOf = (startsAt: string, minutes: number) =>
  new Date(Date.parse(startsAt) + minutes * 60_000).toISOString();

// «Стол 2 · Завтра · 12:00–13:00» для выбранного окна.
export function usePickedSummary(today: string, timezone: string) {
  const t = useTranslations("PublicBooking");
  const time = useTimeFormat(timezone);
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
      to: time(endOf(picked.startsAt, picked.durationMin)),
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

// Число дней лентой; дальние даты — полем даты.
const DATE_CHIPS = 14;

// Бронь по шагам, как в приложениях клубов: сначала дата, тариф и время
// начала, потом место на схеме. Окна считает база (get_availability),
// страница только показывает их.
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
  onPick: (slot: PickedSlot) => void;
}) {
  const t = useTranslations("PublicBooking");
  const time = useTimeFormat(timezone);
  const durations = durationOptions(minDuration, slotStep);
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
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<"tariff" | "own">(
    tariffs.length > 0 ? "tariff" : "own",
  );
  const [tariffId, setTariffId] = useState(tariffs[0]?.id ?? null);
  const [duration, setDuration] = useState(durations[0]);
  const tariff =
    mode === "tariff" ? (tariffs.find((p) => p.id === tariffId) ?? null) : null;
  const minutes = tariff ? tariff.minutes : duration;
  const [chosenTime, setTime] = useState<string | null>(null);
  const [chosenStep, setStep] = useState<"when" | "seat">("when");
  const [hallId, setHallId] = useState(halls[0]?.id);
  const [chosenSeat, setSeat] = useState<string | null>(null);
  const [busyTap, setBusyTap] = useState<string | null>(null);
  const [slots, setSlots] = useState<PublicSlot[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const request = useRef(0);
  const top = useRef<HTMLDivElement>(null);

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
    .filter(
      (r) =>
        r.bookable_online &&
        (!tariff || tariff.resource_kinds.includes(r.kind)),
    );
  const allowed = new Set(resources.map((r) => r.id));
  const usable = (slots ?? []).filter((s) => allowed.has(s.resourceId));
  // Время начала и сколько мест на него свободно.
  const times = new Map<string, Set<string>>();
  for (const s of [...usable].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  )) {
    const set = times.get(s.startsAt) ?? new Set<string>();
    set.add(s.resourceId);
    times.set(s.startsAt, set);
  }

  // Выбор, который после перечитывания окон уже недоступен, сбрасывается сам.
  const picked = chosenTime && times.has(chosenTime) ? chosenTime : null;
  const free = picked ? times.get(picked)! : new Set<string>();
  const seat = chosenSeat && free.has(chosenSeat) ? chosenSeat : null;
  const step = chosenStep === "seat" && picked ? "seat" : "when";
  const seatResource = resources.find((r) => r.id === seat);

  const lastDate = addDays(today, maxDaysAhead);
  const chips = Array.from(
    { length: Math.min(DATE_CHIPS, maxDaysAhead + 1) },
    (_, i) => addDays(today, i),
  );
  const durationLabel = (m: number) =>
    t("durationValue", { hours: Math.floor(m / 60), minutes: m % 60 }).trim();
  const weekday = (d: string) =>
    new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" })
      .format(new Date(`${d}T00:00:00Z`))
      .replace(".", "");

  // Смена даты или длительности сбрасывает время и место: окна уже другие.
  function change(next: () => void) {
    next();
    setTime(null);
    setSeat(null);
    setBusyTap(null);
  }

  function goTo(next: "when" | "seat") {
    setStep(next);
    setBusyTap(null);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function confirm() {
    if (!picked || !seatResource) return;
    onPick({
      resourceId: seatResource.id,
      resourceName: seatResource.name,
      date,
      startsAt: picked,
      durationMin: minutes,
      packageId: tariff?.id ?? null,
      packageName: tariff?.name ?? null,
      price: tariff?.price ?? null,
    });
  }

  function tapSeat(id: string | null) {
    if (!id || !allowed.has(id)) return;
    if (free.has(id)) {
      setSeat(id);
      setBusyTap(null);
    } else {
      setBusyTap(id);
    }
  }

  const range = picked
    ? `${time(picked)}–${time(endOf(picked, minutes))}`
    : null;
  const whenLine = picked
    ? [
        dayLabelOf(date, today, t),
        range,
        tariff ? tariff.name : durationLabel(minutes),
      ].join(" · ")
    : null;

  const hall = halls.find((h) => h.id === hallId) ?? halls[0];
  const fitted = hall ? fitHall(hall) : null;
  const statuses: Record<string, ItemStatus> = Object.fromEntries(
    resources.map((r) => [
      r.id,
      {
        tone: r.id === seat ? "picked" : free.has(r.id) ? "free" : "off",
      } as ItemStatus,
    ]),
  );

  return (
    <div
      ref={top}
      className="grid min-w-0 scroll-mt-4 gap-6"
      data-testid="booking-picker"
      data-step={step}
    >
      <Steps step={step} />

      {step === "when" ? (
        <>
          <fieldset className="grid min-w-0 gap-3">
            <legend className="mb-3 flex w-full items-baseline justify-between text-sm font-semibold">
              {t("date")}
              <span className="text-muted-foreground font-normal first-letter:uppercase">
                {dayLabelOf(date, today, t)}
              </span>
            </legend>
            <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
              {chips.map((d) => {
                const weekend = isoWeekday(d) >= 6;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={d === date}
                    aria-label={dayLabelOf(d, today, t)}
                    onClick={() => change(() => setDate(d))}
                    className="group bg-muted hover:bg-accent aria-pressed:bg-primary aria-pressed:text-primary-foreground grid h-16 w-14 shrink-0 place-content-center gap-0.5 rounded-xl text-center transition-colors"
                  >
                    <span
                      className={cn(
                        "text-xs capitalize",
                        weekend
                          ? "text-primary group-aria-pressed:text-primary-foreground"
                          : "text-muted-foreground group-aria-pressed:text-primary-foreground/80",
                      )}
                    >
                      {weekday(d)}
                    </span>
                    <span className="text-lg leading-none font-bold tabular-nums">
                      {Number(d.slice(8))}
                    </span>
                  </button>
                );
              })}
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
                  className="h-9 w-auto [color-scheme:dark]"
                />
              </div>
            )}
          </fieldset>

          <div className="grid gap-3">
            {tariffs.length > 0 && (
              <div
                className="bg-muted grid grid-cols-2 gap-1 rounded-xl p-1"
                role="group"
                aria-label={t("tariff")}
              >
                {(["tariff", "own"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => change(() => setMode(m))}
                    className="text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground h-10 rounded-lg text-sm font-semibold transition-colors"
                  >
                    {m === "tariff" ? t("modeTariffs") : t("ownTime")}
                  </button>
                ))}
              </div>
            )}

            {mode === "tariff" ? (
              <fieldset className="min-w-0">
                <legend className="sr-only">{t("tariff")}</legend>
                <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
                  {tariffs.map((p) => (
                    <label
                      key={p.id}
                      className="bg-muted has-checked:bg-foreground has-checked:text-background relative grid min-w-40 shrink-0 cursor-pointer gap-3 rounded-2xl p-4 transition-colors"
                    >
                      <input
                        type="radio"
                        name="public-tariff"
                        value={p.id}
                        checked={tariffId === p.id}
                        onChange={() => change(() => setTariffId(p.id))}
                        className="accent-primary absolute top-3.5 right-3.5 size-4"
                      />
                      <span className="pr-6 font-semibold">{p.name}</span>
                      <span className="grid">
                        <span className="text-xl font-bold tabular-nums">
                          {t("price", {
                            price: p.price.toLocaleString("ru-RU"),
                          })}
                        </span>
                        <span className="text-sm opacity-70">
                          {durationLabel(p.minutes)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <fieldset className="grid min-w-0 gap-3">
                <legend className="mb-3 text-sm font-semibold">
                  {t("duration")}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {durations.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={duration === m}
                      onClick={() => change(() => setDuration(m))}
                      className="bg-muted hover:bg-accent aria-pressed:bg-foreground aria-pressed:text-background h-10 rounded-xl px-4 text-sm font-semibold tabular-nums transition-colors"
                    >
                      {durationLabel(m)}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </div>

          <section
            className="grid gap-3"
            aria-labelledby="start-title"
            aria-busy={pending}
            data-testid="availability"
            data-state={pending || !slots ? "loading" : "ready"}
          >
            <h3
              id="start-title"
              className="flex items-baseline justify-between text-sm font-semibold"
            >
              {t("start")}
              {whenLine && (
                <span className="text-muted-foreground font-normal">
                  {range}
                </span>
              )}
            </h3>
            {failed ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <p className="text-destructive">{t("loadError")}</p>
                <Button variant="outline" size="sm" onClick={load}>
                  {t("retry")}
                </Button>
              </div>
            ) : slots === null ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {Array.from({ length: 8 }, (_, i) => (
                  <div
                    key={i}
                    className="bg-muted h-14 animate-pulse rounded-xl"
                  />
                ))}
              </div>
            ) : times.size === 0 ? (
              <p className="bg-muted rounded-xl p-4 text-sm">{t("noSlots")}</p>
            ) : (
              <div
                className={cn(
                  "grid grid-cols-4 gap-2 transition-opacity sm:grid-cols-6",
                  pending && "opacity-60",
                )}
                data-testid="time-slots"
              >
                {[...times].map(([startsAt, seats]) => (
                  <button
                    key={startsAt}
                    type="button"
                    aria-pressed={startsAt === picked}
                    onClick={() => {
                      setTime(startsAt);
                      setBusyTap(null);
                    }}
                    className="bg-muted hover:bg-accent aria-pressed:ring-primary aria-pressed:bg-background grid h-14 place-content-center rounded-xl text-center transition-colors aria-pressed:ring-2"
                  >
                    <span className="font-bold tabular-nums">
                      {time(startsAt)}
                    </span>
                    {/* Ночное окно — уже следующие сутки рабочего дня. */}
                    <span className="text-muted-foreground text-[11px] leading-tight">
                      {todayIn(timezone, new Date(startsAt)) !== date
                        ? t("night")
                        : t("freeCount", { count: seats.size })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <StickyAction>
            <Button
              size="lg"
              className="w-full"
              disabled={!picked}
              onClick={() => goTo("seat")}
            >
              {picked ? t("chooseSeat") : t("chooseTime")}
            </Button>
          </StickyAction>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon-lg"
              onClick={() => goTo("when")}
              aria-label={t("back")}
            >
              <ArrowLeft />
            </Button>
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">{t("stepWhen")}</p>
              <p className="truncate font-semibold first-letter:uppercase">
                {whenLine}
              </p>
            </div>
          </div>

          {halls.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {halls.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  aria-pressed={h.id === hall.id}
                  onClick={() => setHallId(h.id)}
                  className="bg-muted aria-pressed:bg-foreground aria-pressed:text-background h-9 rounded-lg px-3 text-sm font-medium"
                >
                  {h.name}
                </button>
              ))}
            </div>
          )}

          {fitted && (
            <div className="grid gap-2">
              <div
                className="relative w-full overflow-hidden rounded-2xl border"
                style={{
                  aspectRatio: `${fitted.size.width} / ${fitted.size.height}`,
                }}
              >
                <HallCanvas
                  hall={fitted.size}
                  items={fitted.items}
                  selectedKey={null}
                  editable={false}
                  statuses={statuses}
                  dark
                  onSelect={tapSeat}
                  onChange={() => {}}
                />
              </div>
              <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <Legend className="bg-[#15301f] ring-2 ring-[#34c46a]">
                  {t("legendFree")}
                </Legend>
                <Legend className="bg-[#2a2a2a] ring-1 ring-[#3d3d3d]">
                  {t("legendBusy")}
                </Legend>
                <Legend className="bg-primary">{t("legendPicked")}</Legend>
              </ul>
            </div>
          )}

          <fieldset className="grid min-w-0 gap-3">
            <legend className="mb-3 text-sm font-semibold">
              {t("seatsTitle")}
            </legend>
            <div className="flex flex-wrap gap-2" data-testid="seat-list">
              {resources.map((r) => {
                const isFree = free.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={!isFree}
                    aria-pressed={r.id === seat}
                    onClick={() => tapSeat(r.id)}
                    className="bg-muted hover:bg-accent aria-pressed:bg-primary aria-pressed:text-primary-foreground h-11 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-40"
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
            <p
              className={cn(
                "text-sm",
                busyTap ? "text-destructive" : "text-muted-foreground",
              )}
              aria-live="polite"
            >
              {busyTap
                ? t("seatTaken", {
                    name: resources.find((r) => r.id === busyTap)?.name ?? "",
                  })
                : seatResource
                  ? t("seatPicked", { name: seatResource.name })
                  : t("pickSeat")}
            </p>
          </fieldset>

          <StickyAction>
            <Button
              size="lg"
              className="w-full"
              disabled={!seatResource}
              onClick={confirm}
            >
              {t("next")}
            </Button>
          </StickyAction>
        </>
      )}
    </div>
  );
}

// Шаги брони: дата и время → место → контакты.
export function Steps({ step }: { step: "when" | "seat" | "guest" }) {
  const t = useTranslations("PublicBooking");
  const order = ["when", "seat", "guest"] as const;
  const current = order.indexOf(step);
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label={t("stepsLabel")}>
      {order.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? "step" : undefined}
          className="grid gap-1.5"
        >
          <span
            className={cn(
              "h-1 rounded-full",
              i <= current ? "bg-primary" : "bg-muted",
            )}
          />
          <span
            className={cn(
              "text-xs",
              i === current
                ? "text-foreground font-semibold"
                : "text-muted-foreground",
            )}
          >
            {t(`step.${s}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}

// Главная кнопка шага: на телефоне прилипает к низу экрана.
export function StickyAction({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card/95 sticky bottom-0 z-10 -mx-4 -mb-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6 lg:static lg:mx-0 lg:mb-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      {children}
    </div>
  );
}

function Legend({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("size-3 rounded-sm", className)} />
      {children}
    </li>
  );
}

function fitHall(hall: PublicHall) {
  return fitToItems(hall, [
    ...hall.objects.map((o) => ({ ...o, type: "object" as const, key: o.id })),
    ...hall.resources.map((r) => ({
      ...r,
      type: "resource" as const,
      key: r.id,
      is_active: true,
    })),
  ] satisfies EditorItem[]);
}
