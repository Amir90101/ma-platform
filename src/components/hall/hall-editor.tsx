"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveHallLayout } from "@/app/app/hall-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  type Box,
  clampToHall,
  freeSpot,
  nextName,
  normalizeRotation,
} from "@/lib/hall/geometry";
import type {
  Layout,
  LayoutObject,
  LayoutResource,
} from "@/lib/validation/hall";
import { RESOURCE_DEFAULTS, type ResourceKind } from "@/lib/venue-types";

// Konva работает только в браузере.
const HallCanvas = dynamic(() => import("./hall-canvas"), {
  ssr: false,
  loading: () => <div className="bg-muted/30 size-full animate-pulse" />,
});

export type EditorItem =
  | ({ type: "resource"; key: string } & LayoutResource)
  | ({ type: "object"; key: string } & LayoutObject);

type Hall = { id: string; name: string; width: number; height: number };

function toItems(layout: Layout): EditorItem[] {
  return [
    ...layout.objects.map((o) => ({
      ...o,
      type: "object" as const,
      key: o.id!,
    })),
    ...layout.resources.map((r) => ({
      ...r,
      type: "resource" as const,
      key: r.id!,
    })),
  ];
}

function toLayout(items: EditorItem[]): Layout {
  const layout: Layout = { resources: [], objects: [] };
  for (const item of items) {
    const box = {
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      rotation: item.rotation,
    };
    if (item.type === "resource") {
      layout.resources.push({
        id: item.id,
        kind: item.kind,
        name: item.name,
        capacity: item.capacity,
        shape: item.shape,
        bookable_online: item.bookable_online,
        is_active: item.is_active,
        ...box,
      });
    } else {
      layout.objects.push({
        id: item.id,
        kind: item.kind,
        label: item.label,
        ...box,
      });
    }
  }
  return layout;
}

export function HallEditor({
  venueId,
  hall,
  initialLayout,
  resourceKinds,
}: {
  venueId: string;
  hall: Hall;
  initialLayout: Layout;
  resourceKinds: ResourceKind[];
}) {
  const t = useTranslations("Hall");
  const [items, setItems] = useState(() => toItems(initialLayout));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; error?: string }>();
  const [saving, startSaving] = useTransition();
  const selected = items.find((i) => i.key === selectedKey) ?? null;

  // Не терять несохранённую карту при закрытии вкладки.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(key: string, patch: Partial<EditorItem>) {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? ({ ...i, ...patch } as EditorItem) : i)),
    );
    setDirty(true);
    setStatus(undefined);
  }

  function updateBox(key: string, patch: Partial<Box & { rotation: number }>) {
    const item = items.find((i) => i.key === key);
    if (!item) return;
    const box = clampToHall({ ...item, ...patch }, hall);
    update(key, { ...patch, ...box });
  }

  function addResource(kind: ResourceKind) {
    const d = RESOURCE_DEFAULTS[kind];
    const spot = freeSpot(d, items, hall);
    const names = items.flatMap((i) => (i.type === "resource" ? [i.name] : []));
    const item: EditorItem = {
      type: "resource",
      key: crypto.randomUUID(),
      kind,
      name: nextName(t(`namePrefix.${kind}`), names),
      capacity: d.capacity,
      ...spot,
      w: d.w,
      h: d.h,
      rotation: 0,
      shape: d.shape,
      bookable_online: true,
      is_active: true,
    };
    setItems((prev) => [...prev, item]);
    setSelectedKey(item.key);
    setDirty(true);
    setStatus(undefined);
  }

  function remove(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
    setSelectedKey(null);
    setDirty(true);
    setStatus(undefined);
  }

  function save() {
    startSaving(async () => {
      const result = await saveHallLayout(venueId, hall.id, toLayout(items));
      if (result.ok) {
        setItems(toItems(result.layout));
        setSelectedKey(null);
        setDirty(false);
        setStatus({ ok: true });
      } else {
        setStatus({ ok: false, error: result.error });
      }
    });
  }

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">{t("hint")}</p>

      <div className="flex flex-wrap gap-2" role="toolbar">
        {resourceKinds.map((kind) => (
          <Button
            key={kind}
            type="button"
            variant="outline"
            onClick={() => addResource(kind)}
          >
            + {t(`resourceKinds.${kind}`)}
          </Button>
        ))}
      </div>

      {/* Место под холст с пропорциями зала, пока грузится Konva. */}
      <div
        className="relative w-full overflow-hidden rounded-lg border"
        style={{ aspectRatio: `${hall.width} / ${hall.height}` }}
      >
        <HallCanvas
          hall={hall}
          items={items}
          selectedKey={selectedKey}
          editable
          onSelect={setSelectedKey}
          onChange={updateBox}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={saving || !dirty}>
          {saving ? t("saving") : t("save")}
        </Button>
        {dirty && (
          <span className="text-muted-foreground text-sm">{t("unsaved")}</span>
        )}
        {status?.ok && (
          <span role="status" className="text-sm text-emerald-700">
            {t("saved")}
          </span>
        )}
        {status?.error && (
          <span className="text-destructive text-sm" data-testid="hall-error">
            {t(`errors.${status.error}`)}
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="grid content-start gap-3 rounded-lg border p-4">
          <h2 className="font-medium">{t("selected")}</h2>
          {selected ? (
            <ItemProperties
              key={selected.key}
              item={selected}
              onChange={(patch) => update(selected.key, patch)}
              onBoxChange={(patch) => updateBox(selected.key, patch)}
              onRemove={() => remove(selected.key)}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("nothingSelected")}
            </p>
          )}
        </section>

        <section className="grid content-start gap-2 rounded-lg border p-4">
          <h2 className="font-medium">{t("listTitle")}</h2>
          <ul className="grid gap-1" data-testid="hall-items">
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => setSelectedKey(item.key)}
                  aria-pressed={item.key === selectedKey}
                  className="hover:bg-muted aria-pressed:bg-muted w-full rounded-md px-2 py-1 text-left text-sm"
                >
                  {item.type === "resource"
                    ? item.name
                    : (item.label ?? t(`objectKinds.${item.kind}`))}
                  <span className="text-muted-foreground">
                    {" · "}
                    {item.type === "resource"
                      ? t(`resourceKinds.${item.kind}`)
                      : t(`objectKinds.${item.kind}`)}
                    {item.type === "resource" &&
                      !item.is_active &&
                      ` · ${t("inactiveBadge")}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function ItemProperties({
  item,
  onChange,
  onBoxChange,
  onRemove,
}: {
  item: EditorItem;
  onChange: (patch: Partial<EditorItem>) => void;
  onBoxChange: (patch: Partial<Box & { rotation: number }>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Hall");
  const num = (value: string) => (value === "" ? 0 : Math.round(Number(value)));

  return (
    <div className="grid gap-3">
      {item.type === "resource" ? (
        <>
          <Prop id="prop-name" label={t("name")}>
            <Input
              id="prop-name"
              value={item.name}
              maxLength={50}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </Prop>
          <div className="grid grid-cols-2 gap-3">
            <Prop id="prop-capacity" label={t("capacity")}>
              <Input
                id="prop-capacity"
                type="number"
                min={1}
                value={item.capacity ?? ""}
                onChange={(e) =>
                  onChange({
                    capacity: e.target.value ? num(e.target.value) : null,
                  })
                }
              />
            </Prop>
            <Prop id="prop-shape" label={t("shape")}>
              <NativeSelect
                id="prop-shape"
                className="w-full"
                value={item.shape}
                onChange={(e) =>
                  onChange({ shape: e.target.value as "rect" | "circle" })
                }
              >
                <NativeSelectOption value="rect">
                  {t("shapes.rect")}
                </NativeSelectOption>
                <NativeSelectOption value="circle">
                  {t("shapes.circle")}
                </NativeSelectOption>
              </NativeSelect>
            </Prop>
          </div>
          <Check
            label={t("bookableOnline")}
            checked={item.bookable_online}
            onChange={(v) => onChange({ bookable_online: v })}
          />
          <Check
            label={t("active")}
            checked={item.is_active}
            onChange={(v) => onChange({ is_active: v })}
          />
          <p className="text-muted-foreground text-xs">{t("inactiveHint")}</p>
        </>
      ) : (
        <Prop id="prop-label" label={t("label")}>
          <Input
            id="prop-label"
            value={item.label ?? ""}
            maxLength={50}
            onChange={(e) => onChange({ label: e.target.value || null })}
          />
        </Prop>
      )}

      <div className="grid grid-cols-5 gap-2">
        {(["x", "y", "w", "h", "rotation"] as const).map((field) => (
          <Prop key={field} id={`prop-${field}`} label={t(field)}>
            <Input
              id={`prop-${field}`}
              type="number"
              value={item[field]}
              step={field === "rotation" ? 15 : 10}
              // Размеры и положение правим как есть, в пределы зала
              // возвращаем при уходе из поля, чтобы не мешать набору.
              onChange={(e) =>
                field === "rotation"
                  ? onBoxChange({
                      rotation: normalizeRotation(num(e.target.value)),
                    })
                  : onChange({ [field]: num(e.target.value) })
              }
              onBlur={() => onBoxChange({})}
            />
          </Prop>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onBoxChange({ rotation: normalizeRotation(item.rotation + 90) })
          }
        >
          {t("rotate90")}
        </Button>
        <Button type="button" variant="destructive" onClick={onRemove}>
          {t("delete")}
        </Button>
      </div>
      {item.type === "resource" && item.id && (
        <p className="text-muted-foreground text-xs">{t("deleteHint")}</p>
      )}
    </div>
  );
}

function Prop({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4"
      />
      {label}
    </label>
  );
}
