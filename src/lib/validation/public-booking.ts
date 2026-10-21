import { z } from "zod";
import { normalizeKzPhone } from "@/lib/phone";

// Тело запроса POST /api/public-booking. Сообщения об ошибках — ключи из
// messages/*.json (раздел PublicBooking.errors).
export const publicBookingSchema = z.object({
  resourceId: z.guid("unknown"),
  startsAt: z.iso.datetime({ offset: true, message: "unknown" }),
  durationMin: z
    .number("unknown")
    .int("unknown")
    .min(15)
    .max(24 * 60),
  name: z.string().trim().min(1, "nameRequired").max(100, "tooLong"),
  phone: z
    .string()
    .trim()
    .min(1, "phoneRequired")
    .transform((v, ctx) => {
      const phone = normalizeKzPhone(v);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "phoneFormat" });
        return z.NEVER;
      }
      return phone;
    }),
  guests: z
    .number("guestsFormat")
    .int("guestsFormat")
    .min(1, "guestsFormat")
    .max(100, "guestsFormat")
    .nullable(),
  comment: z.string().trim().max(500, "tooLong"),
  consent: z.literal(true, "consentRequired"),
  // Пусто, если Turnstile не настроен (только локально, см. verifyTurnstile).
  turnstileToken: z.string().max(4096),
});

export type PublicBookingInput = z.input<typeof publicBookingSchema>;

export type PublicBookingResponse =
  | { ok: true; token: string; code: string; startsAt: string; endsAt: string }
  | { ok: false; error: string };

// Короткий код брони для гостя: первые 8 знаков id, как в get_booking_by_token.
export function bookingCode(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
