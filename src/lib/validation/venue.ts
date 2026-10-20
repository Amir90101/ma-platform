import { z } from "zod";
import type { Database } from "@/lib/supabase/types";

// Сообщения об ошибках — ключи из messages/*.json (раздел Venue.errors).

export type VenueType = Database["public"]["Enums"]["venue_type"];

export const VENUE_TYPES = [
  "billiards",
  "ps_club",
  "pc_club",
  "ps_pc_club",
  "karaoke",
  "sauna",
  "sports_court",
] as const satisfies readonly VenueType[];

// Совпадает с ограничением venues_slug_not_reserved в базе.
export const RESERVED_SLUGS = [
  "app",
  "api",
  "b",
  "login",
  "register",
  "admin",
  "settings",
  "about",
  "help",
  "terms",
  "privacy",
];

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Русские и казахские буквы латиницей. Остальное (знаки, пробелы) станет дефисом.
// prettier-ignore
const TRANSLIT: Record<string, string> = {
  а: "a", ә: "a", б: "b", в: "v", г: "g", ғ: "g", д: "d", е: "e", ё: "e",
  ж: "zh", з: "z", и: "i", і: "i", й: "y", к: "k", қ: "k", л: "l", м: "m",
  н: "n", ң: "n", о: "o", ө: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ұ: "u", ү: "u", ф: "f", х: "h", һ: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

// Предложение slug из названия: «Бильярд Пирамида» → «bilyard-piramida».
export function slugify(name: string): string {
  return Array.from(name.toLowerCase(), (ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, "");
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(SLUG_MIN_LENGTH, "slugTooShort")
  .max(SLUG_MAX_LENGTH, "slugTooLong")
  .regex(SLUG_PATTERN, "slugFormat")
  .refine((s) => !RESERVED_SLUGS.includes(s), "slugReserved");

// Часы работы: 1 = понедельник … 7 = воскресенье, по ISO.
// close меньше open — работа через полночь. Выходной день в массив не попадает.
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "timeFormat");

export const workingDaySchema = z
  .object({ weekday: z.number().int().min(1).max(7), open: time, close: time })
  .refine((d) => d.open !== d.close, {
    message: "timeSame",
    path: ["close"],
  });

export type WorkingDay = z.infer<typeof workingDaySchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .transform((s) => s || null);

export const venueSchema = z.object({
  type: z.enum(VENUE_TYPES, "typeRequired"),
  name: z.string().trim().min(1, "nameRequired").max(100, "tooLong"),
  slug: slugSchema,
  city: z.string().trim().min(1, "cityRequired").max(100, "tooLong"),
  address: optionalText(200),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?[0-9 ()-]{5,30})?$/, "phoneFormat")
    .transform((s) => s || null),
  description: optionalText(2000),
  workingHours: z.array(workingDaySchema),
});

export type VenueInput = z.infer<typeof venueSchema>;

export const organizationNameSchema = z
  .string()
  .trim()
  .min(1, "orgNameRequired")
  .max(100, "tooLong");

// Форма присылает по каждому дню поля hours.{d}.closed/open/close.
// Ошибки дней собираем с ключами hours.{d}.
export function workingHoursFromForm(formData: FormData) {
  return WEEKDAYS.filter((d) => formData.get(`hours.${d}.closed`) !== "on").map(
    (d) => ({
      weekday: d,
      open: String(formData.get(`hours.${d}.open`) ?? ""),
      close: String(formData.get(`hours.${d}.close`) ?? ""),
    }),
  );
}

export function venueFromForm(formData: FormData) {
  return {
    type: formData.get("type"),
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    city: String(formData.get("city") ?? ""),
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    description: String(formData.get("description") ?? ""),
    workingHours: workingHoursFromForm(formData),
  };
}

// Первая ошибка по полю: { slug: "slugReserved", "hours.3": "timeSame" }.
export function venueFieldErrors(
  error: z.ZodError,
  input: { workingHours: { weekday: number }[] },
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const [field, index] = issue.path;
    const key =
      field === "workingHours" && typeof index === "number"
        ? `hours.${input.workingHours[index]?.weekday}`
        : String(field ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}
