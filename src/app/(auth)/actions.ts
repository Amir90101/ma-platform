"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import {
  type FieldErrors,
  fieldErrors,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  safeNextPath,
} from "@/lib/validation/auth";

// Ошибки — ключи из messages (раздел Auth.errors).
export type AuthFormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  // Введённые значения без паролей: React очищает форму после отправки.
  values?: { email?: string; fullName?: string };
  done?: boolean;
  // Вход удался: форма открывает адрес полной загрузкой страницы.
  redirectTo?: string;
};

function authErrorKey(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "user_already_exists":
    case "email_exists":
      return "emailTaken";
    case "weak_password":
      return "passwordTooShort";
    case "same_password":
      return "samePassword";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rateLimited";
    default:
      return "unknown";
  }
}

function textValues(formData: FormData): AuthFormState["values"] {
  return {
    email: String(formData.get("email") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
  };
}

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const values = textValues(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: authErrorKey(error), values };

  // На планшете клуба сотрудники сменяют друг друга: после входа страница
  // грузится заново, кэш маршрутов прошлого пользователя не используется.
  revalidatePath("/", "layout");
  return { redirectTo: safeNextPath(formData.get("next")) };
}

export async function forgotPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });
  const values = textValues(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${siteUrl()}/auth/confirm?next=/reset-password`,
    },
  );
  // Неизвестный email тоже считаем успехом: нельзя выяснять, кто зарегистрирован.
  if (error && authErrorKey(error) === "rateLimited")
    return { error: "rateLimited", values };

  return { done: true, values };
}

export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "resetLinkExpired" };

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: authErrorKey(error) };

  redirect("/app");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
