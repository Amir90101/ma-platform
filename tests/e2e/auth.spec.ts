import { expect, test } from "@playwright/test";
import { login, OWNER, uniqueEmail } from "./helpers";

const MAILPIT = "http://127.0.0.1:54324";

// Последнее письмо на адрес из локальной почты Supabase (Mailpit).
async function lastEmailText(email: string): Promise<string> {
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

test("без входа /app ведёт на страницу входа и возвращает обратно после входа", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp/);

  await login(page, OWNER.email, OWNER.password);
  await expect(page).toHaveURL("/app");
  await expect(page.getByTestId("current-user")).toContainText(OWNER.email);
});

test("неверный пароль показывает ошибку и не пускает", async ({ page }) => {
  await page.goto("/login");
  await login(page, OWNER.email, "wrong-password");
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Неверный email или пароль",
  );
  await expect(page).toHaveURL(/\/login/);
});

test("выход возвращает на вход и закрывает /app", async ({ page }) => {
  await page.goto("/login");
  await login(page, OWNER.email, OWNER.password);
  await expect(page).toHaveURL("/app");

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL("/login");

  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
});

test("вошедшего пользователя страница входа отправляет в админку", async ({
  page,
}) => {
  await page.goto("/login");
  await login(page, OWNER.email, OWNER.password);
  await expect(page).toHaveURL("/app");

  await page.goto("/login");
  await expect(page).toHaveURL("/app");
});

test("регистрация нового владельца сразу открывает админку", async ({
  page,
}) => {
  const email = uniqueEmail("owner");
  await page.goto("/register");

  await page.getByLabel("Имя").fill("Тестовый Владелец");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Пароль, не меньше/).fill("short");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page.getByText("Пароль слишком короткий")).toBeVisible();

  await page.getByLabel(/Пароль, не меньше/).fill("test-password-1");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page).toHaveURL("/app");
  await expect(page.getByTestId("current-user")).toContainText(email);
});

test("занятый email при регистрации даёт понятную ошибку", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Имя").fill("Кто-то");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel(/Пароль, не меньше/).fill("test-password-1");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "уже зарегистрирован",
  );
});

test("сброс пароля по ссылке из письма", async ({ page }) => {
  // Отдельный пользователь, чтобы не менять пароль демо-владельцу.
  const email = uniqueEmail("reset");
  await page.goto("/register");
  await page.getByLabel("Имя").fill("Сброс Пароля");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Пароль, не меньше/).fill("old-password-1");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page).toHaveURL("/app");
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL("/login");

  await page.getByRole("link", { name: "Забыли пароль?" }).click();
  await expect(page).toHaveURL("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Отправить ссылку" }).click();
  await expect(page.getByRole("status")).toContainText(email);

  const body = await lastEmailText(email);
  const link = body.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
  expect(link, "ссылка в письме").toBeTruthy();

  await page.goto(link!);
  await expect(page).toHaveURL("/reset-password");
  await page.getByLabel(/Новый пароль/).fill("new-password-1");
  await page.getByLabel("Повторите пароль").fill("new-password-1");
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(page).toHaveURL("/app");

  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, email, "old-password-1");
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Неверный email или пароль",
  );
  await login(page, email, "new-password-1");
  await expect(page).toHaveURL("/app");
});
