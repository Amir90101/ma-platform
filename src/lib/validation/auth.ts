import { z } from "zod";

// Сообщения об ошибках — ключи из messages/*.json (раздел Auth.errors),
// текст подставляет форма.

export const PASSWORD_MIN_LENGTH = 8;

const email = z.string().trim().toLowerCase().email("emailInvalid");
const password = z.string().min(PASSWORD_MIN_LENGTH, "passwordTooShort");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "passwordRequired"),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(1, "nameRequired").max(100, "nameTooLong"),
  email,
  password,
});

export const forgotPasswordSchema = z.object({ email });

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
