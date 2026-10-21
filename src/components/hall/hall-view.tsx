"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { MousePointerClick, Pause, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  pauseSession,
  resumeSession,
  type SessionActionResult,
  startSession,
  transferSession,
} from "@/app/app/session-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { OpenSession } from "@/lib/hall/open-sessions";
import { createClient } from "@/lib/supabase/client";
import type { Layout, LayoutResource } from "@/lib/validation/hall";
import { CheckoutPanel } from "./checkout-panel";
import type { ItemStatus } from "./hall-canvas";
import type { EditorItem } from "./hall-editor";
import { type OpenShift, ShiftBar } from "./shift-bar";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useVenueRealtime } from "@/lib/hooks/use-venue-realtime";
import { arriveBooking } from "@/app/app/booking-actions";
import { ARRIVE_EARLY_MS, canArrive } from "@/lib/booking-rules";
import type { UpcomingBooking } from "@/lib/hall/upcoming-bookings";

const HallCanvas = dynamic(() => import("./hall-canvas"), {
  ssr: false,
  loading: () => <div className="bg-muted/30 size-full animate-pulse" />,
});

const DURATIONS = [30, 60, 90, 120, 180, 240];

// Цвета статусов — токены из globals.css, те же, что на карте.
const STATE_DOT = {
  free: "bg-status-free",
  busy: "bg-status-busy",
  paused: "bg-status-paused",
} as const;
const STATE_CHIP = {
  free: "bg-card border-border",
  busy: "bg-status-busy-soft border-status-busy/30",
  paused: "bg-status-paused-soft border-status-paused/40",
} as const;
// Статусы столов, смена и брони во всех открытых окнах.
const REALTIME_TABLES = [
  "session_segments",
  "sessions",
  "shifts",
  "bookings",
] as const;

export type VenueResource = { id: string; name: string; hallName: string };
export type PackageOption = { id: string; name: string };

// Часы браузера с поправкой на время сервера: таймеры не зависят от того,
// насколько точно идут часы на компьютере администратора. Поправку меряем
// запросом server_now из браузера с учётом половины времени запроса.
function useServerClock() {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const sentAt = Date.now();
    createClient()
      .rpc("server_now")
      .then(({ data }) => {
        if (!data) return;
        const receivedAt = Date.now();
        setOffset(Date.parse(data) + (receivedAt - sentAt) / 2 - receivedAt);
      });
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [offset]);
  return now;
}

function formatClock(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Рабочий экран: карта со статусами столов и управление сеансами.
// Выключенные ресурсы не показываем — на них нельзя запускать сеансы.
export function HallView({
  venueId,
  timezone,
  hall,
  halls,
  layout,
  sessions,
  venueResources,
  packages,
  shift,
  bookings,
}: {
  venueId: string;
  timezone: string;
  hall: { id: string; width: number; height: number };
  halls: { id: string; name: string }[];
  layout: Layout;
  sessions: OpenSession[];
  venueResources: VenueResource[];
  packages: PackageOption[];
  shift: OpenShift | null;
  // Ждущие брони по времени начала.
  bookings: UpcomingBooking[];
}) {
  const t = useTranslations("Hall");
  const tw = useTranslations("Work");
  const router = useRouter();
  const now = useServerClock();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Стол, который заняли из другого окна, пока мы нажимали «Старт».
  // Отказ показываем на уровне панели: форма старта исчезнет, когда
  // придёт новый статус стола.
  const [busyNotice, setBusyNotice] = useState<string | null>(null);
  const realtime = useVenueRealtime(venueId, REALTIME_TABLES);
  const panelRef = useRef<HTMLElement>(null);
  // На телефоне панель стола под картой: после выбора стола показываем её.
  useEffect(() => {
    if (selectedKey && window.matchMedia("(max-width: 1023px)").matches) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedKey]);

  // Сумма считается в базе: раз в минуту перечитываем страницу.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [router]);

  const resources = layout.resources.filter((r) => r.is_active);
  const sessionByResource = new Map(sessions.map((s) => [s.resourceId, s]));
  // Ближайшая ждущая бронь каждого стола (bookings отсортированы по началу).
  const bookingByResource = new Map<string, UpcomingBooking>();
  for (const b of bookings) {
    if (!bookingByResource.has(b.resourceId)) {
      bookingByResource.set(b.resourceId, b);
    }
  }
  const items: EditorItem[] = [
    ...layout.objects.map((o) => ({
      ...o,
      type: "object" as const,
      key: o.id!,
    })),
    ...resources.map((r) => ({ ...r, type: "resource" as const, key: r.id! })),
  ];
  const statuses: Record<string, ItemStatus> = {};
  for (const r of resources) {
    const s = sessionByResource.get(r.id!);
    statuses[r.id!] = s
      ? {
          tone: s.status === "paused" ? "paused" : "busy",
          caption: formatElapsed(now - Date.parse(s.startedAt)),
        }
      : { tone: "free", caption: bookingCaption(r.id!) };
  }
  // Свободный стол с бронью в ближайшие часы: время брони на карте.
  function bookingCaption(resourceId: string) {
    const b = bookingByResource.get(resourceId);
    if (!b || Date.parse(b.startsAt) - now > ARRIVE_EARLY_MS) return undefined;
    return tw("bookingCaption", { time: formatClock(b.startsAt, timezone) });
  }
  const selected = resources.find((r) => r.id === selectedKey) ?? null;
  const selectedBooking = selected
    ? bookingByResource.get(selected.id!)
    : undefined;
  const busyIds = new Set(sessions.map((s) => s.resourceId));
  const stateOf = (id: string): "free" | "busy" | "paused" => {
    const s = sessionByResource.get(id);
    return s ? (s.status === "paused" ? "paused" : "busy") : "free";
  };
  const counts = { free: 0, busy: 0, paused: 0 };
  for (const r of resources) counts[stateOf(r.id!)]++;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:gap-6">
      <div className="lg:col-span-2">
        <ShiftBar venueId={venueId} shift={shift} timezone={timezone} />
      </div>

      <div className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {halls.length > 1 ? (
            <nav
              aria-label={t("halls")}
              className="bg-muted flex flex-wrap gap-1 rounded-lg p-1"
            >
              {halls.map((h) => (
                <Link
                  key={h.id}
                  href={`/app/${venueId}/hall?hall=${h.id}`}
                  aria-current={h.id === hall.id ? "page" : undefined}
                  className="text-muted-foreground hover:text-foreground aria-[current=page]:bg-card aria-[current=page]:text-foreground rounded-md px-3 py-1.5 text-sm font-medium aria-[current=page]:shadow-xs"
                >
                  {h.name}
                </Link>
              ))}
            </nav>
          ) : (
            <span />
          )}
          <ul className="flex flex-wrap gap-2 text-sm" aria-label={t("legend")}>
            {(["free", "busy", "paused"] as const).map((state) => (
              <li
                key={state}
                className="bg-card flex items-center gap-2 rounded-full border px-3 py-1"
              >
                <span
                  aria-hidden="true"
                  className={STATE_DOT[state] + " size-2.5 rounded-full"}
                />
                {tw(state)}
                <span className="font-semibold tabular-nums">
                  {counts[state]}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="bg-card relative w-full overflow-hidden rounded-xl border shadow-xs"
          style={{ aspectRatio: `${hall.width} / ${hall.height}` }}
        >
          <HallCanvas
            hall={hall}
            items={items}
            selectedKey={selectedKey}
            editable={false}
            statuses={statuses}
            onSelect={(key) => {
              setSelectedKey(key);
              setBusyNotice(null);
            }}
            onChange={() => {}}
          />
        </div>

        <section className="grid gap-2">
          <h2 className="text-muted-foreground text-sm font-medium">
            {t("resourcesTitle")}
          </h2>
          <ul
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"
            data-testid="hall-resources"
          >
            {resources.map((r) => {
              const state = stateOf(r.id!);
              const s = sessionByResource.get(r.id!);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedKey(r.id!);
                      setBusyNotice(null);
                    }}
                    aria-pressed={r.id === selectedKey}
                    data-state={state}
                    className={
                      STATE_CHIP[state] +
                      " aria-pressed:ring-primary grid w-full gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-shadow hover:shadow-sm aria-pressed:ring-2"
                    }
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={
                          STATE_DOT[state] + " size-2.5 shrink-0 rounded-full"
                        }
                      />
                      <span className="truncate font-medium">{r.name}</span>
                    </span>
                    <span className="text-muted-foreground pl-4.5 text-xs tabular-nums">
                      <span className="sr-only"> · </span>
                      {s
                        ? formatElapsed(now - Date.parse(s.startedAt))
                        : tw(state)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section
        ref={panelRef}
        className="bg-card grid scroll-mt-20 gap-4 rounded-xl border p-4 shadow-xs sm:p-5 lg:sticky lg:top-24"
        data-testid="resource-panel"
        data-realtime={realtime}
      >
        {selected ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{selected.name}</h2>
              <span
                className={
                  STATE_CHIP[stateOf(selected.id!)] +
                  " rounded-full border px-2.5 py-0.5 text-xs font-medium"
                }
              >
                {tw(stateOf(selected.id!))}
              </span>
            </div>
            {busyNotice === selected.id && (
              <ActionError error="resource_busy" />
            )}
            {selectedBooking && (
              <BookingNotice
                key={selectedBooking.id}
                booking={selectedBooking}
                now={now}
                timezone={timezone}
                busy={sessionByResource.has(selected.id!)}
              />
            )}
            {sessionByResource.has(selected.id!) ? (
              <SessionCard
                key={sessionByResource.get(selected.id!)!.id}
                session={sessionByResource.get(selected.id!)!}
                now={now}
                timezone={timezone}
                freeResources={venueResources.filter((r) => !busyIds.has(r.id))}
                onTransferred={setSelectedKey}
              />
            ) : (
              <StartForm
                key={selected.id}
                resource={selected}
                packages={packages}
                onBusy={() => {
                  setBusyNotice(selected.id!);
                  router.refresh();
                }}
              />
            )}
          </>
        ) : (
          <div className="grid justify-items-center gap-2 py-8 text-center">
            <MousePointerClick
              aria-hidden="true"
              className="text-muted-foreground size-8"
            />
            <p className="text-muted-foreground text-sm">
              {tw("pickResource")}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const run = (action: () => Promise<SessionActionResult>) =>
    startTransition(async () => {
      const r = await action();
      setError(r.ok ? undefined : r.error);
    });
  return { pending, error, run };
}

function ActionError({ error }: { error?: string }) {
  const tw = useTranslations("Work");
  if (!error) return null;
  return (
    <p className="text-destructive text-sm" data-testid="work-error">
      {tw(`errors.${error}`)}
    </p>
  );
}

// Бронь на выбранном столе: предупреждение перед стартом без брони и
// кнопка «Пришёл», которая превращает бронь в сеанс.
function BookingNotice({
  booking: b,
  now,
  timezone,
  busy,
}: {
  booking: UpcomingBooking;
  now: number;
  timezone: string;
  busy: boolean;
}) {
  const tw = useTranslations("Work");
  const tb = useTranslations("Bookings");
  const { pending, error, run } = useAction();
  const hydrated = useHydrated();
  const left = Math.max(0, Date.parse(b.startsAt) - now);
  const minutes = Math.floor(left / 60_000);
  const started = left === 0;

  let text: string;
  if (busy) {
    text = tw("bookingNext", { time: formatClock(b.startsAt, timezone) });
  } else if (started) {
    text = tw("bookingStarted", {
      from: formatClock(b.startsAt, timezone),
      to: formatClock(b.endsAt, timezone),
    });
  } else {
    text = tw("bookingSoon", {
      time: formatClock(b.startsAt, timezone),
      left:
        minutes >= 60
          ? tw("leftHM", {
              hours: Math.floor(minutes / 60),
              minutes: minutes % 60,
            })
          : tw("leftM", { minutes }),
    });
  }

  return (
    <div
      className="grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950"
      data-testid="booking-notice"
    >
      <p className="font-medium">{text}</p>
      {b.guest && (
        <p>
          {tw("bookingGuest", { guest: b.guest })}
          {b.guests && <> · {tb("guestsCount", { count: b.guests })}</>}
        </p>
      )}
      {b.noShowCount > 0 && (
        <p className="font-medium text-amber-800 dark:text-amber-300">
          {tb("noShows", { count: b.noShowCount })}
        </p>
      )}
      {!busy && canArrive(b.startsAt, b.endsAt, now) && (
        <div>
          <Button
            type="button"
            size="sm"
            disabled={pending || !hydrated}
            onClick={() => run(() => arriveBooking(b.id))}
          >
            {pending ? tw("arriving") : tw("arrived")}
          </Button>
        </div>
      )}
      <ActionError error={error} />
    </div>
  );
}

function StartForm({
  resource,
  packages,
  onBusy,
}: {
  resource: LayoutResource;
  packages: PackageOption[];
  onBusy: () => void;
}) {
  const tw = useTranslations("Work");
  const { pending, error, run } = useAction();
  const hydrated = useHydrated();

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        run(async () => {
          const r = await startSession(resource.id!, formData);
          if (!r.ok && r.error === "resource_busy") onBusy();
          return r;
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="start-duration">{tw("duration")}</Label>
          <NativeSelect id="start-duration" name="duration" className="w-full">
            <NativeSelectOption value="">
              {tw("durationNone")}
            </NativeSelectOption>
            {DURATIONS.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {m % 60 === 0
                  ? tw("durationHours", { hours: m / 60 })
                  : tw("durationMinutes", { minutes: m })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {packages.length > 0 && (
          <div className="grid gap-1.5">
            <Label htmlFor="start-package">{tw("package")}</Label>
            <NativeSelect id="start-package" name="package" className="w-full">
              <NativeSelectOption value="">
                {tw("packageNone")}
              </NativeSelectOption>
              {packages.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="start-name">{tw("guestName")}</Label>
          <Input
            id="start-name"
            name="name"
            autoComplete="off"
            maxLength={100}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="start-phone">{tw("guestPhone")}</Label>
          <Input
            id="start-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            placeholder="+7 700 000 00 00"
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">{tw("noEndHint")}</p>
      {/* «Стол занят» показывает панель: форма исчезнет со статусом стола. */}
      <ActionError error={error === "resource_busy" ? undefined : error} />
      <div>
        <Button type="submit" size="lg" disabled={pending || !hydrated}>
          {pending ? tw("starting") : tw("start")}
        </Button>
      </div>
    </form>
  );
}

function SessionCard({
  session,
  now,
  timezone,
  freeResources,
  onTransferred,
}: {
  session: OpenSession;
  now: number;
  timezone: string;
  freeResources: VenueResource[];
  // После переноса панель переходит на новый стол.
  onTransferred: (resourceId: string) => void;
}) {
  const tw = useTranslations("Work");
  const { pending, error, run } = useAction();
  const [target, setTarget] = useState("");
  // «Стоп» ставит сеанс на паузу (сумма перестаёт расти) и открывает чек.
  const [checkout, setCheckout] = useState(false);
  const time = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(iso));
  const paused = session.status === "paused";

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        <span className="sr-only" data-testid="session-status">
          {paused ? tw("paused") : tw("busy")}
        </span>
        {tw("startedAt", { time: time(session.startedAt) })}
        {session.expectedEndAt &&
          ` · ${tw("expectedEnd", { time: time(session.expectedEndAt) })}`}
      </p>
      {(session.guest || session.packageName) && (
        <p className="text-sm">
          {session.guest && tw("guest", { guest: session.guest })}
          {session.guest && session.packageName && " · "}
          {session.packageName}
        </p>
      )}
      <dl className="bg-muted/60 grid grid-cols-2 gap-3 rounded-lg p-3">
        <div>
          <dt className="text-muted-foreground text-xs">{tw("elapsed")}</dt>
          <dd
            className="text-3xl font-semibold tracking-tight tabular-nums"
            data-testid="session-timer"
          >
            {formatElapsed(now - Date.parse(session.startedAt))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{tw("amount")}</dt>
          <dd
            className="text-3xl font-semibold tracking-tight tabular-nums"
            data-testid="session-amount"
          >
            {session.amount === null
              ? "—"
              : tw("amountValue", { amount: session.amount })}
          </dd>
        </div>
      </dl>
      {session.amountError ? (
        <ActionError
          error={session.amountError === "no_tariff" ? "no_tariff" : "unknown"}
        />
      ) : (
        <p className="text-muted-foreground text-xs">{tw("amountUpdated")}</p>
      )}

      {checkout ? (
        <CheckoutPanel
          sessionId={session.id}
          onCancel={() => {
            setCheckout(false);
            run(() => resumeSession(session.id));
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {paused ? (
              <Button
                type="button"
                size="lg"
                disabled={pending}
                onClick={() => run(() => resumeSession(session.id))}
              >
                <Play aria-hidden="true" />
                {tw("resume")}
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => pauseSession(session.id))}
              >
                <Pause aria-hidden="true" />
                {tw("pause")}
              </Button>
            )}
            <Button
              type="button"
              size="lg"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = paused
                    ? { ok: true as const }
                    : await pauseSession(session.id);
                  if (r.ok) setCheckout(true);
                  return r;
                })
              }
            >
              <Square aria-hidden="true" />
              {tw("stop")}
            </Button>
          </div>

          <div className="flex items-end gap-2 border-t pt-4">
            <div className="grid min-w-0 flex-1 gap-1.5">
              <Label htmlFor="transfer-to">{tw("transferTo")}</Label>
              <NativeSelect
                id="transfer-to"
                className="w-full"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                disabled={!freeResources.length}
              >
                <NativeSelectOption value="">
                  {freeResources.length ? "—" : tw("noFreeResources")}
                </NativeSelectOption>
                {freeResources.map((r) => (
                  <NativeSelectOption key={r.id} value={r.id}>
                    {r.name} · {r.hallName}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !target}
              onClick={() =>
                run(async () => {
                  const r = await transferSession(session.id, target);
                  if (r.ok) onTransferred(target);
                  return r;
                })
              }
            >
              {tw("transferSubmit")}
            </Button>
          </div>
        </>
      )}
      <ActionError error={error} />
    </div>
  );
}
