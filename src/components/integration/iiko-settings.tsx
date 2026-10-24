"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  disableIiko,
  enableIiko,
  type IikoOptions,
  type IikoResult,
  loadIikoOptions,
  setBookingOnly,
} from "@/app/app/iiko-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

export type IikoState = {
  hasKey: boolean;
  enabled: boolean;
  organizationId: string | null;
  terminalGroupId: string | null;
  sectionIds: string[];
  syncedAt: string | null;
  tables: number;
};

function useIikoError() {
  const t = useTranslations("Integration");
  const [error, setError] = useState<string>();
  const show = (r: IikoResult) => {
    if (r.ok) setError(undefined);
    else
      setError(
        r.detail
          ? t("errors.iiko", { detail: r.detail })
          : t(`errors.${r.error}`),
      );
    return r.ok;
  };
  return { error, show };
}

// Поля iiko внутри формы: ключ → организация → группа терминалов → залы.
// Значения уходят в форму полями iikoApiLogin, iikoOrganizationId,
// iikoTerminalGroupId, iikoSectionIds. Используются при подключении
// заведения и в настройках заведения в /admin.
export function IikoFields({
  venueId,
  initial,
}: {
  venueId?: string;
  initial?: IikoState;
}) {
  const t = useTranslations("Integration");
  const [pending, startTransition] = useTransition();
  const { error, show } = useIikoError();
  const keyRef = useRef<HTMLInputElement>(null);
  const [options, setOptions] = useState<IikoOptions | null>(null);
  const [org, setOrg] = useState(initial?.organizationId ?? "");
  const [group, setGroup] = useState(initial?.terminalGroupId ?? "");

  function load(nextOrg: string, nextGroup: string) {
    startTransition(async () => {
      const r = await loadIikoOptions(
        { venueId, apiLogin: keyRef.current?.value },
        nextOrg || null,
        nextGroup || null,
      );
      if (show(r) && r.ok) setOptions(r);
    });
  }

  return (
    <div className="grid gap-4" data-testid="iiko-fields">
      <div className="grid gap-1.5">
        <Label htmlFor="iiko-api-login">{t("apiLogin")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={keyRef}
            id="iiko-api-login"
            name="iikoApiLogin"
            type="password"
            autoComplete="off"
            placeholder={initial?.hasKey ? t("apiLoginSaved") : ""}
            className="sm:flex-1"
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => load(org, group)}
          >
            {t("checkKey")}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">{t("apiLoginHint")}</p>
      </div>

      {options && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="iiko-org">{t("organization")}</Label>
            <NativeSelect
              id="iiko-org"
              name="iikoOrganizationId"
              value={org}
              onChange={(e) => {
                setOrg(e.target.value);
                setGroup("");
                load(e.target.value, "");
              }}
            >
              <NativeSelectOption value="">{t("choose")}</NativeSelectOption>
              {options.organizations.map((o) => (
                <NativeSelectOption key={o.id} value={o.id}>
                  {o.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {org && (
            <div className="grid gap-1.5">
              <Label htmlFor="iiko-group">{t("terminalGroup")}</Label>
              <NativeSelect
                id="iiko-group"
                name="iikoTerminalGroupId"
                value={group}
                onChange={(e) => {
                  setGroup(e.target.value);
                  load(org, e.target.value);
                }}
              >
                <NativeSelectOption value="">{t("choose")}</NativeSelectOption>
                {options.terminalGroups.map((g) => (
                  <NativeSelectOption key={g.id} value={g.id}>
                    {g.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
          {group && options.sections.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">
                {t("sections")}
              </legend>
              {options.sections.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="iikoSectionIds"
                    value={s.id}
                    defaultChecked={
                      !initial?.sectionIds.length ||
                      initial.sectionIds.includes(s.id)
                    }
                    className="accent-primary size-4"
                  />
                  {t("sectionLine", { name: s.name, tables: s.tables })}
                </label>
              ))}
            </fieldset>
          )}
        </>
      )}
      {error && (
        <p className="text-destructive text-sm" data-testid="iiko-error">
          {error}
        </p>
      )}
    </div>
  );
}

// Режим заведения в /admin: только владелец платформы.
export function BookingOnlySwitch({
  venueId,
  on,
}: {
  venueId: string;
  on: boolean;
}) {
  const t = useTranslations("Integration");
  const [pending, startTransition] = useTransition();
  const { error, show } = useIikoError();
  return (
    <div className="grid gap-2">
      <label className="bg-muted flex items-start gap-3 rounded-xl p-4">
        <input
          type="checkbox"
          defaultChecked={on}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            startTransition(async () => {
              show(await setBookingOnly(venueId, next));
            });
          }}
          className="accent-primary mt-1 size-4"
        />
        <span className="grid gap-0.5">
          <span className="font-semibold">{t("bookingOnly")}</span>
          <span className="text-muted-foreground text-sm">
            {t("bookingOnlyHint")}
          </span>
        </span>
      </label>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

// iiko существующего заведения в /admin: состояние, смена залов, выключение.
export function IikoVenueSettings({
  venueId,
  state,
}: {
  venueId: string;
  state: IikoState;
}) {
  const t = useTranslations("Integration");
  const [pending, startTransition] = useTransition();
  const { error, show } = useIikoError();
  const [editing, setEditing] = useState(!state.enabled);
  const [done, setDone] = useState<number>();

  if (state.enabled && !editing) {
    return (
      <div className="grid gap-3" data-testid="iiko-status">
        <IikoStatus state={state} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            {t("change")}
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                show(await disableIiko(venueId));
              })
            }
          >
            {t("disable")}
          </Button>
        </div>
        {done !== undefined && (
          <p role="status" className="text-success text-sm font-medium">
            {t("synced", { tables: done })}
          </p>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
          const r = await enableIiko(venueId, formData);
          if (show(r) && r.ok) {
            setDone(r.tables);
            setEditing(false);
          }
        });
      }}
    >
      <IikoFields venueId={venueId} initial={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("enable")}
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  );
}

export function IikoStatus({ state }: { state: IikoState }) {
  const t = useTranslations("Integration");
  return state.enabled ? (
    <p className="bg-status-free-soft text-status-free rounded-xl px-4 py-3 text-sm font-medium">
      {t("enabled", {
        tables: state.tables,
        time: state.syncedAt
          ? new Date(state.syncedAt).toLocaleString("ru-RU")
          : "—",
      })}
    </p>
  ) : (
    <p className="bg-muted text-muted-foreground rounded-xl px-4 py-3 text-sm">
      {t("notConnected")}
    </p>
  );
}
