import { z } from "zod";
import { RESOURCE_DEFAULTS, type ResourceKind } from "@/lib/venue-types";
import { WEEKDAYS } from "@/lib/validation/venue";

// Сообщения об ошибках — ключи из messages/*.json (раздел Tariffs.errors).

const RESOURCE_KINDS = Object.keys(RESOURCE_DEFAULTS) as [
  ResourceKind,
  ...ResourceKind[],
];
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "timeFormat");
const kinds = z.array(z.enum(RESOURCE_KINDS)).min(1, "kindsRequired");
// Целое число из поля формы. Пустое поле — ошибка, а не 0: Number("") === 0.
const intField = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .pipe(
      z.coerce
        .number<string>(message)
        .int(message)
        .min(min, message)
        .max(max, message),
    );
const money = (max: number) => intField(0, max, "priceFormat");

// time_to раньше time_from — тариф через полночь; равные — круглые сутки.
export const tariffSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(50, "tooLong"),
  resource_kinds: kinds,
  price_per_hour: money(1_000_000),
  weekdays: z
    .array(z.coerce.number<string>().int().min(1).max(7))
    .min(1, "weekdaysRequired"),
  time_from: time,
  time_to: time,
  priority: z.coerce
    .number<string>("priorityFormat")
    .int("priorityFormat")
    .min(-100, "priorityFormat")
    .max(100, "priorityFormat"),
  is_active: z.boolean(),
});

export const packageSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(50, "tooLong"),
  resource_kinds: kinds,
  minutes: intField(1, 24 * 60, "minutesFormat"),
  price: money(10_000_000),
  is_active: z.boolean(),
});

export function tariffFromForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    resource_kinds: formData.getAll("resource_kinds").map(String),
    price_per_hour: String(formData.get("price_per_hour") ?? ""),
    weekdays: formData.getAll("weekdays").map(String),
    time_from: String(formData.get("time_from") ?? ""),
    time_to: String(formData.get("time_to") ?? ""),
    priority: String(formData.get("priority") || "0"),
    is_active: formData.get("is_active") === "on",
  };
}

export function packageFromForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    resource_kinds: formData.getAll("resource_kinds").map(String),
    minutes: String(formData.get("minutes") ?? ""),
    price: String(formData.get("price") ?? ""),
    is_active: formData.get("is_active") === "on",
  };
}

export { WEEKDAYS };
