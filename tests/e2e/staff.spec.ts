import { type Browser, expect, type Page, test } from "@playwright/test";
import { seedWorkVenue } from "./fixtures";
import { login, registerOwner, uniqueEmail, uniqueSuffix } from "./helpers";

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

// Сценарий 5 из docs/USER_FLOWS.md (этап 9.3): сотрудник по логину,
// вход открывает смену, выход закрывает её с пересчётом кассы.
test("владелец создаёт сотрудника; вход открывает смену, выход закрывает", async ({
  page,
  browser,
}) => {
  // Длинный сценарий из двух браузеров: на dev-сервере дольше 30 секунд.
  test.setTimeout(90_000);
  const ownerEmail = uniqueEmail("staff-owner");
  await registerOwner(page, ownerEmail);
  await expect(page).toHaveURL("/app");
  const { venueId } = await seedWorkVenue(ownerEmail, 2);
  await page.goto(`/app/${venueId}/settings/staff`);
  await page.waitForLoadState("networkidle");

  // Пустая форма — ошибки у полей.
  const add = page.getByRole("button", { name: "Добавить сотрудника" });
  await add.click();
  await expect(page.getByText("Введите имя")).toBeVisible();
  await expect(page.getByText("Логин латиницей")).toBeVisible();

  const staffLogin = `ai-${uniqueSuffix()}`;
  await page.getByLabel("Имя", { exact: true }).fill("Айгерим");
  await page.getByLabel("Логин", { exact: true }).fill(staffLogin);
  await page.getByLabel("Пароль", { exact: true }).fill("staff-pass-1");
  await add.click();
  await expect(page.getByRole("status")).toHaveText(
    `Сотрудник добавлен. Логин для входа: ${staffLogin}`,
  );
  await expect(page.getByTestId("staff-list")).toContainText(
    `Логин: ${staffLogin}`,
  );

  // Тот же логин второй раз не создаётся.
  await page.getByLabel("Имя", { exact: true }).fill("Двойник");
  await page.getByLabel("Логин", { exact: true }).fill(staffLogin);
  await page.getByLabel("Пароль", { exact: true }).fill("staff-pass-1");
  await add.click();
  await expect(page.getByText("Такой логин уже занят")).toBeVisible();

  // Сотрудник входит по логину и сразу открывает смену.
  const staff = await newPage(browser);
  await staff.goto("/login");
  await login(staff, staffLogin, "staff-pass-1");
  await expect(staff).toHaveURL(`/app/${venueId}/hall`);
  const start = staff.getByTestId("shift-start");
  await expect(start).toContainText("Начало смены");
  await start.getByLabel("Наличные в кассе, ₸").fill("5000");
  await start.getByRole("button", { name: "Открыть смену" }).click();
  await expect(staff.getByTestId("shift-start")).toHaveCount(0);
  await expect(staff.getByTestId("shift-bar")).toContainText(
    "В кассе на начало: 5000",
  );
  await expect(staff.getByRole("link", { name: "Настройки" })).toHaveCount(0);

  // Выход — через закрытие смены.
  await staff.getByRole("link", { name: "Закрыть смену" }).click();
  await expect(staff).toHaveURL(`/app/${venueId}/shift-end`);
  const end = staff.getByTestId("shift-end");
  await end.getByLabel("Наличные в кассе сейчас, ₸").fill("4500");
  await end.getByRole("button", { name: "Закрыть смену" }).click();
  const result = staff.getByTestId("shift-end-result");
  await expect(result).toContainText("По системе5 000 ₸");
  await expect(result).toContainText("В кассе4 500 ₸");
  await expect(result).toContainText("Разница-500 ₸");
  await result.getByRole("button", { name: "Выйти" }).click();
  await expect(staff).toHaveURL("/login");

  // Владелец видит смену и недостачу в отчётах.
  await page.goto(`/app/${venueId}/reports`);
  const row = page.getByTestId("shift-row").first();
  await expect(row).toContainText("Айгерим");
  await expect(row).toContainText("-500 ₸");

  // Новый пароль от владельца: старый не подходит, новый — да.
  await page.goto(`/app/${venueId}/settings/staff`);
  await page.waitForLoadState("networkidle");
  await page.getByText("Сменить пароль").click();
  await page.getByLabel(`Новый пароль для ${staffLogin}`).fill("staff-pass-2");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("Пароль изменён")).toBeVisible();

  await login(staff, staffLogin, "staff-pass-1");
  await expect(staff.locator("form").getByRole("alert")).toHaveText(
    "Неверный логин, email или пароль",
  );
  await login(staff, staffLogin, "staff-pass-2");
  await expect(staff.getByTestId("shift-start")).toBeVisible();
  await staff.getByRole("button", { name: "Выйти, не открывая смену" }).click();
  await expect(staff).toHaveURL("/login");

  // Удалённый сотрудник больше не видит заведение.
  await page.getByRole("button", { name: `Удалить ${staffLogin}` }).click();
  await expect(page.getByTestId("staff-list")).not.toContainText(staffLogin);
  await page.reload();
  await expect(page.getByTestId("staff-list")).toContainText("Владелец");
  await expect(page.getByTestId("staff-list")).not.toContainText(staffLogin);
  await login(staff, staffLogin, "staff-pass-2");
  await expect(staff).toHaveURL("/app");
  await expect(staff.getByText("У вас пока нет заведений")).toBeVisible();
});
