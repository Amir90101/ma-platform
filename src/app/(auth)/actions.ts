"use server";

import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  type FieldErrors,
  fieldErrors,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
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

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
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

  redirect(safeNextPath(formData.get("next")));
}

export async function register(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const values = textValues(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=/app`,
    },
  });
  if (error) return { error: authErrorKey(error), values };

  // Если подтверждение почты включено, сессии ещё нет: просим открыть письмо.
  if (!data.session) return { done: true, values };

  redirect("/app");
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
  redirect("/login");
}
