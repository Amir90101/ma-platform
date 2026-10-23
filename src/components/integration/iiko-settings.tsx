"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  disableIiko,
  enableIiko,
  type IikoResult,
  loadIikoOptions,
  saveIikoKey,
  setBookingOnly,
} from "@/app/app/iiko-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

type Option = { id: string; name: string };

export type IikoState = {
  hasKey: boolean;
  enabled: boolean;
  organizationId: string | null;
  terminalGroupId: string | null;
  sectionIds: string[];
  syncedAt: string | null;
  tables: number;
};

function useError() {
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

export function BookingOnlySwitch({
  venueId,
  on,
}: {
  venueId: string;
  on: boolean;
}) {
  const t = useTranslations("Integration");
  const [pending, startTransition] = useTransition();
  const { error, show } = useError();
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

// Подключение iiko: ключ → организация → группа терминалов → залы.
export function IikoSettings({
  venueId,
  state,
}: {
  venueId: string;
  state: IikoState;
}) {
  const t = useTranslations("Integration");
  const [pending, startTransition] = useTransition();
  const { error, show } = useError();
  const [editing, setEditing] = useState(!state.enabled);
  const [orgs, setOrgs] = useState<Option[] | null>(null);
  const [groups, setGroups] = useState<Option[]>([]);
  const [sections, setSections] = useState<(Option & { tables: number })[]>([]);
  const [org, setOrg] = useState(state.organizationId ?? "");
  const [group, setGroup] = useState(state.terminalGroupId ?? "");
  const [done, setDone] = useState<number>();

  function load(nextOrg: string, nextGroup: string) {
    startTransition(async () => {
      const r = await loadIikoOptions(
        venueId,
        nextOrg || null,
        nextGroup || null,
      );
      if (show(r) && r.ok) {
        setOrgs(r.organizations);
        setGroups(r.terminalGroups);
        setSections(r.sections);
      }
    });
  }

  if (state.enabled && !editing) {
    return (
      <div className="grid gap-3" data-testid="iiko-status">
        <p className="bg-status-free-soft text-status-free rounded-xl px-4 py-3 text-sm font-medium">
          {t("enabled", {
            tables: state.tables,
            time: state.syncedAt
              ? new Date(state.syncedAt).toLocaleString("ru-RU")
              : "—",
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setEditing(true);
              load(org, group);
            }}
          >
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
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
    );
  }

  return (
    <div className="grid gap-5" data-testid="iiko-form">
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startTransition(async () => {
            const r = await saveIikoKey(venueId, formData);
            if (show(r) && r.ok) setOrgs(r.organizations);
          });
        }}
      >
        <Label htmlFor="iiko-api-login">{t("apiLogin")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="iiko-api-login"
            name="apiLogin"
            type="password"
            autoComplete="off"
            placeholder={state.hasKey ? t("apiLoginSaved") : ""}
            className="sm:flex-1"
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {t("checkKey")}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">{t("apiLoginHint")}</p>
        {state.hasKey && !orgs && (
          <Button
            type="button"
            variant="link"
            className="w-fit px-0"
            onClick={() => load(org, group)}
          >
            {t("useSavedKey")}
          </Button>
        )}
      </form>

      {orgs && (
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
          <div className="grid gap-1.5">
            <Label htmlFor="iiko-org">{t("organization")}</Label>
            <NativeSelect
              id="iiko-org"
              name="organizationId"
              value={org}
              onChange={(e) => {
                setOrg(e.target.value);
                setGroup("");
                setSections([]);
                load(e.target.value, "");
              }}
            >
              <NativeSelectOption value="">{t("choose")}</NativeSelectOption>
              {orgs.map((o) => (
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
                name="terminalGroupId"
                value={group}
                onChange={(e) => {
                  setGroup(e.target.value);
                  load(org, e.target.value);
                }}
              >
                <NativeSelectOption value="">{t("choose")}</NativeSelectOption>
                {groups.map((g) => (
                  <NativeSelectOption key={g.id} value={g.id}>
                    {g.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
          {group && sections.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">
                {t("sections")}
              </legend>
              {sections.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="sectionIds"
                    value={s.id}
                    defaultChecked={
                      state.sectionIds.length === 0 ||
                      state.sectionIds.includes(s.id)
                    }
                    className="accent-primary size-4"
                  />
                  {t("sectionLine", { name: s.name, tables: s.tables })}
                </label>
              ))}
            </fieldset>
          )}
          <div>
            <Button type="submit" disabled={pending || !group}>
              {pending ? t("saving") : t("enable")}
            </Button>
          </div>
        </form>
      )}
      {done !== undefined && (
        <p role="status" className="text-success text-sm font-medium">
          {t("synced", { tables: done })}
        </p>
      )}
      {error && (
        <p className="text-destructive text-sm" data-testid="iiko-error">
          {error}
        </p>
      )}
    </div>
  );
}
