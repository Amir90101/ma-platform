import type { Page } from "@playwright/test";

// Демо-пользователи из supabase/seed.sql.
export const OWNER = { email: "owner@demo.local", password: "demo12345" };

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

export async function registerOwner(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Имя").fill("Тестовый Владелец");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Пароль, не меньше/).fill("test-password-1");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
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
