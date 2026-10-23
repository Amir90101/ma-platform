import { z } from "zod";
import { STAFF_LOGIN_PATTERN, staffEmail } from "@/lib/staff-login";

// Сообщения об ошибках — ключи из messages/*.json (раздел Auth.errors),
// текст подставляет форма.

export const PASSWORD_MIN_LENGTH = 8;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("emailInvalid");
const password = z.string().min(PASSWORD_MIN_LENGTH, "passwordTooShort");

// Вход по email (владелец) или по логину (сотрудник): логин превращаем
// в служебный адрес, см. src/lib/staff-login.ts.
const emailOrLogin = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v, ctx) => {
    if (v.includes("@")) {
      if (z.email().safeParse(v).success) return v;
    } else if (STAFF_LOGIN_PATTERN.test(v)) {
      return staffEmail(v);
    }
    ctx.addIssue({ code: "custom", message: "emailOrLoginInvalid" });
    return z.NEVER;
  });

export const loginSchema = z.object({
  email: emailOrLogin,
  password: z.string().min(1, "passwordRequired"),
});

export const staffSchema = z.object({
  fullName: z.string().trim().min(1, "nameRequired").max(100, "nameTooLong"),
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(STAFF_LOGIN_PATTERN, "loginFormat"),
  password,
});

export const staffPasswordSchema = z.object({ password });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: "passwordsDontMatch",
    path: ["confirmPassword"],
  });

export type FieldErrors = Partial<Record<string, string>>;

// Первая ошибка по каждому полю: { email: "emailInvalid" }.
export function fieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    result[field] ??= issue.message;
  }
  return result;
}

// Куда вернуть после входа: только относительный путь внутри приложения,
// иначе ссылка вида /login?next=https://evil.example уведёт с сайта.
export function safeNextPath(next: unknown, fallback = "/app"): string {
  if (typeof next !== "string") return fallback;
  if (
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return fallback;
  }
  return next;
}
