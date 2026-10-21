import { z } from "zod";
import { normalizeKzPhone } from "@/lib/phone";

// Сообщения об ошибках — ключи из messages/*.json (раздел Bookings.errors).

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "timeFormat");

// Совпадает с проверками таблицы bookings: guests 1–100, comment до 500.
export const manualBookingSchema = z
  .object({
    resource_id: z.guid("resourceRequired"),
    start: time,
    end: time,
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
    name: z.string().trim().max(100, "tooLong"),
    guests: z
      .string()
      .trim()
      .transform((v) => (v ? Number(v) : null))
      .pipe(
        z
          .number("guestsFormat")
          .int("guestsFormat")
          .min(1, "guestsFormat")
          .max(100, "guestsFormat")
          .nullable(),
      ),
    comment: z.string().trim().max(500, "tooLong"),
  })
  .refine((v) => v.start !== v.end, { message: "timeEqual", path: ["end"] });

export function manualBookingFromForm(formData: FormData) {
  const field = (name: string) => String(formData.get(name) ?? "");
  return {
    resource_id: field("resource_id"),
    start: field("start"),
    end: field("end"),
    phone: field("phone"),
    name: field("name"),
    guests: field("guests"),
    comment: field("comment"),
  };
}
