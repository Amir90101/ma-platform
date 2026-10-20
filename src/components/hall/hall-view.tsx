"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  closeSession,
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
import type { Layout, LayoutResource } from "@/lib/validation/hall";
import type { ItemStatus } from "./hall-canvas";
import type { EditorItem } from "./hall-editor";
import { useHydrated } from "@/lib/hooks/use-hydrated";

const HallCanvas = dynamic(() => import("./hall-canvas"), {
  ssr: false,
  loading: () => <div className="bg-muted/30 size-full animate-pulse" />,
});

const DURATIONS = [30, 60, 90, 120, 180, 240];

export type VenueResource = { id: string; name: string; hallName: string };
export type PackageOption = { id: string; name: string };

// Часы браузера с поправкой на время сервера: таймеры не зависят от того,
// насколько точно идут часы на компьютере администратора.
function useServerClock(serverNow: string) {
  const [offset] = useState(() => Date.parse(serverNow) - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [offset]);
  return now;
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
  serverNow,
}: {
  venueId: string;
  timezone: string;
  hall: { id: string; width: number; height: number };
  halls: { id: string; name: string }[];
  layout: Layout;
  sessions: OpenSession[];
  venueResources: VenueResource[];
  packages: PackageOption[];
  serverNow: string;
}) {
  const t = useTranslations("Hall");
  const tw = useTranslations("Work");
  const router = useRouter();
  const now = useServerClock(serverNow);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Сумма считается в базе: раз в минуту перечитываем страницу.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [router]);

  const resources = layout.resources.filter((r) => r.is_active);
  const sessionByResource = new Map(sessions.map((s) => [s.resourceId, s]));
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
      : { tone: "free" };
  }
  const selected = resources.find((r) => r.id === selectedKey) ?? null;
  const busyIds = new Set(sessions.map((s) => s.resourceId));

  return (
    <div className="grid gap-4">
      {halls.length > 1 && (
        <nav aria-label={t("halls")} className="flex flex-wrap gap-2">
          {halls.map((h) => (
            <Link
              key={h.id}
              href={`/app/${venueId}/hall?hall=${h.id}`}
              aria-current={h.id === hall.id ? "page" : undefined}
              className="hover:bg-muted aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground rounded-md px-3 py-1.5 text-sm"
            >
              {h.name}
            </Link>
          ))}
        </nav>
      )}

      <div
        className="relative w-full overflow-hidden rounded-lg border"
        style={{ aspectRatio: `${hall.width} / ${hall.height}` }}
      >
        <HallCanvas
          hall={hall}
          items={items}
          selectedKey={selectedKey}
          editable={false}
          statuses={statuses}
          onSelect={setSelectedKey}
          onChange={() => {}}
        />
      </div>

      <section className="grid gap-2">
        <h2 className="font-medium">{t("resourcesTitle")}</h2>
        <ul className="flex flex-wrap gap-2" data-testid="hall-resources">
          {resources.map((r) => {
            const s = sessionByResource.get(r.id!);
            const state = s
              ? s.status === "paused"
                ? "paused"
                : "busy"
              : "free";
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedKey(r.id!)}
                  aria-pressed={r.id === selectedKey}
                  data-state={state}
                  className="hover:bg-muted aria-pressed:border-primary rounded-md border px-3 py-1.5 text-sm data-[state=busy]:bg-red-50 data-[state=paused]:bg-amber-50"
                >
                  {r.name}
                  <span className="text-muted-foreground"> · {tw(state)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className="grid gap-3 rounded-lg border p-4"
        data-testid="resource-panel"
      >
        {selected ? (
          <>
            <h2 className="text-lg font-semibold">{selected.name}</h2>
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
              />
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{tw("pickResource")}</p>
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

function StartForm({
  resource,
  packages,
}: {
  resource: LayoutResource;
  packages: PackageOption[];
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
        run(() => startSession(resource.id!, formData));
      }}
    >
      <p className="text-sm">
        <span className="font-medium text-emerald-700">{tw("free")}</span>
      </p>
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
      <ActionError error={error} />
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
  const time = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(iso));
  const paused = session.status === "paused";

  return (
    <div className="grid gap-3">
      <p className="text-sm">
        <span
          className={
            paused ? "font-medium text-amber-700" : "font-medium text-red-700"
          }
          data-testid="session-status"
        >
          {paused ? tw("paused") : tw("busy")}
        </span>
        {" · "}
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
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-muted-foreground text-xs">{tw("elapsed")}</dt>
          <dd
            className="font-mono text-2xl tabular-nums"
            data-testid="session-timer"
          >
            {formatElapsed(now - Date.parse(session.startedAt))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{tw("amount")}</dt>
          <dd className="text-2xl tabular-nums" data-testid="session-amount">
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

      <div className="flex flex-wrap gap-2">
        {paused ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => resumeSession(session.id))}
          >
            {tw("resume")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => pauseSession(session.id))}
          >
            {tw("pause")}
          </Button>
        )}
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            if (
              window.confirm(tw("stopConfirm", { amount: session.amount ?? 0 }))
            ) {
              run(() => closeSession(session.id));
            }
          }}
        >
          {tw("stop")}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-to">{tw("transferTo")}</Label>
          <NativeSelect
            id="transfer-to"
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
      <ActionError error={error} />
    </div>
  );
}
