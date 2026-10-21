import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  lastEmailText,
  login,
  OWNER,
  registerOwner,
  uniqueEmail,
} from "./helpers";

// Демо Бильярд из supabase/seed.sql.
const VENUE_ID = "aaaaaaaa-1111-0000-0000-000000000001";

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function invite(page: Page, email: string) {
  await page.getByLabel("Email администратора").fill(email);
  await page.getByRole("button", { name: "Пригласить" }).click();
}

// Сценарий 5 из docs/USER_FLOWS.md.
test("приглашённый администратор задаёт пароль и не видит настройки", async ({
  page,
  browser,
}) => {
  await page.goto("/login");
  await login(page, OWNER.email, OWNER.password);
  await expect(page).toHaveURL("/app");
  await page.getByRole("link", { name: /Демо Бильярд/ }).click();
  await page.getByRole("link", { name: "Настройки" }).click();
  await page.getByRole("link", { name: "Сотрудники" }).click();
  await expect(page).toHaveURL(`/app/${VENUE_ID}/settings/staff`);

  await invite(page, "not-an-email");
  await expect(page.getByTestId("invite-error")).toHaveText(
    "Введите корректный email",
  );

  const adminEmail = uniqueEmail("admin");
  await invite(page, adminEmail);
  await expect(page.getByRole("status")).toContainText(
    `Приглашение отправлено на ${adminEmail}`,
  );
  await expect(page.getByTestId("staff-list")).toContainText(adminEmail);

  // Повторное приглашение того же человека.
  await invite(page, adminEmail);
  await expect(page.getByTestId("invite-error")).toHaveText(
    "Этот пользователь уже в команде",
  );

  // Администратор открывает ссылку из письма в своём браузере.
  const body = await lastEmailText(adminEmail);
  const link = body.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
  expect(link, "ссылка в письме").toBeTruthy();

  const adminPage = await newPage(browser);
  await adminPage.goto(link!);
  await expect(adminPage).toHaveURL("/reset-password");
  await adminPage.getByLabel(/Новый пароль/).fill("admin-password-1");
  await adminPage.getByLabel("Повторите пароль").fill("admin-password-1");
  await adminPage.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(adminPage).toHaveURL("/app");

  await adminPage.getByRole("link", { name: /Демо Бильярд/ }).click();
  await expect(adminPage).toHaveURL(`/app/${VENUE_ID}`);
  await expect(adminPage.getByTestId("venue-role")).toHaveText(
    "Вы администратор",
  );
  await expect(adminPage.getByRole("link", { name: "Настройки" })).toHaveCount(
    0,
  );

  // Прямые ссылки на настройки возвращают на страницу заведения.
  await adminPage.goto(`/app/${VENUE_ID}/settings`);
  await expect(adminPage).toHaveURL(`/app/${VENUE_ID}`);
  await adminPage.goto(`/app/${VENUE_ID}/settings/staff`);
  await expect(adminPage).toHaveURL(`/app/${VENUE_ID}`);

  // Владелец удаляет администратора — доступ пропадает.
  await page.getByRole("button", { name: `Удалить ${adminEmail}` }).click();
  await expect(page.getByTestId("staff-list")).not.toContainText(adminEmail);
  await adminPage.goto(`/app/${VENUE_ID}`);
  await expect(
    adminPage.getByText("Заведение не найдено или у вас нет к нему доступа."),
  ).toBeVisible();
});

test("уже зарегистрированного пользователя добавляют без письма", async ({
  page,
  browser,
}) => {
  const existingEmail = uniqueEmail("existing");
  const other = await newPage(browser);
  await registerOwner(other, existingEmail);
  await expect(other).toHaveURL("/app");

  await page.goto("/login");
  await login(page, OWNER.email, OWNER.password);
  await expect(page).toHaveURL("/app");
  await page.goto(`/app/${VENUE_ID}/settings/staff`);
  await invite(page, existingEmail.toUpperCase());
  await expect(page.getByRole("status")).toContainText(
    `${existingEmail} уже зарегистрирован`,
  );

  // У добавленного пользователя заведение появляется в списке.
  await other.reload();
  await expect(other.getByRole("link", { name: /Демо Бильярд/ })).toBeVisible();

  await page.getByRole("button", { name: `Удалить ${existingEmail}` }).click();
  await expect(page.getByTestId("staff-list")).not.toContainText(existingEmail);
});
