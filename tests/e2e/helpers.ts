import type { Page } from "@playwright/test";
import type { Database } from "../../src/lib/supabase/types";
import { admin } from "./fixtures";

// Демо-пользователи из supabase/seed.sql.
export const OWNER = { email: "owner@demo.local", password: "demo12345" };
export const ADMIN = { email: "admin@demo.local", password: "demo12345" };
export const PLATFORM = { email: "platform@demo.local", password: "demo12345" };
export const DEMO_VENUE_ID = "aaaaaaaa-1111-0000-0000-000000000001";

export async function login(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

// Уникальный email на каждый запуск: тесты не мешают друг другу и повторному прогону.
export function uniqueEmail(prefix: string) {
  return `${prefix}-${uniqueSuffix()}@e2e.local`;
}

export function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Новый владелец без заведений. Регистрация закрыта (этап 9.2): пользователя
// создаём ключом service_role, как это делает приглашение, и входим.
export const OWNER_PASSWORD = "test-password-1";

export async function registerOwner(page: Page, email: string) {
  const { error } = await admin.auth.admin.createUser({
    email,
    password: OWNER_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Тестовый Владелец" },
  });
  if (error) throw error;
  await page.goto("/login");
  await login(page, email, OWNER_PASSWORD);
}

const MAILPIT = "http://127.0.0.1:54324";

// Последнее письмо на адрес из локальной почты Supabase (Mailpit).
export async function lastEmailText(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    ).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) =>
        r.json(),
      );
      return message.HTML || message.Text;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Письмо на ${email} не пришло`);
}

// Новый владелец с заведением; возвращает id заведения. Заведения подключает
// владелец платформы (этап 9.2), здесь — сразу ключом service_role.
export async function ownerWithVenue(
  page: Page,
  type: Database["public"]["Enums"]["venue_type"] = "billiards",
): Promise<string> {
  const email = uniqueEmail("owner");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const { data: user } = await admin.rpc("user_id_by_email", {
    p_email: email,
  });
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: "ТОО Тест", owner_id: user! })
    .select("id")
    .single();
  if (orgError) throw orgError;
  const { data: venue, error } = await admin
    .from("venues")
    .insert({
      org_id: org.id,
      type,
      name: "Тестовый клуб",
      slug: `club-${uniqueSuffix()}`,
      city: "Алматы",
      working_hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        open: "10:00",
        close: "22:00",
      })),
    })
    .select("id")
    .single();
  if (error) throw error;
  await page.goto(`/app/${venue.id}/settings`);
  return venue.id;
}
