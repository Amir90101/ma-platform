import { z } from "zod";

// Сообщения об ошибках — ключи из messages/*.json (раздел BookingRules.errors).
// Границы совпадают с ограничениями venues в базе или строже их.

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

export const bookingRulesSchema = z
  .object({
    online_booking_enabled: z.boolean(),
    slot_step_min: z.enum(["15", "30", "60"], "slotStep").transform(Number),
    min_duration_min: intField(15, 12 * 60, "minDuration"),
    buffer_min: intField(0, 120, "buffer"),
    min_lead_min: intField(0, 24 * 60, "lead"),
    max_days_ahead: intField(1, 365, "daysAhead"),
    no_show_after_min: intField(0, 240, "noShow"),
  })
  // Окна идут с шагом слота: минимальная бронь должна в него укладываться.
  .refine((v) => v.min_duration_min % v.slot_step_min === 0, {
    message: "minDurationStep",
    path: ["min_duration_min"],
  });

export type BookingRules = z.output<typeof bookingRulesSchema>;

export const BOOKING_RULE_FIELDS = [
  "slot_step_min",
  "min_duration_min",
  "buffer_min",
  "min_lead_min",
  "max_days_ahead",
  "no_show_after_min",
] as const;

export function bookingRulesFromForm(formData: FormData) {
  return {
    online_booking_enabled: formData.get("online_booking_enabled") === "on",
    ...Object.fromEntries(
      BOOKING_RULE_FIELDS.map((f) => [f, String(formData.get(f) ?? "")]),
    ),
  };
}
