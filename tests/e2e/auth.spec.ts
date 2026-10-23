import { expect, test } from "@playwright/test";
import {
  lastEmailText,
  login,
  OWNER,
  OWNER_PASSWORD,
  registerOwner,
  uniqueEmail,
} from "./helpers";

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
    "Неверный логин, email или пароль",
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

// Этап 9.2: регистрация закрыта, заведения подключает владелец платформы.
test("регистрации нет: /register ведёт на вход", async ({ page }) => {
  await page.goto("/register");
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("link", { name: "Регистрация" })).toHaveCount(0);
});

test("сброс пароля по ссылке из письма", async ({ page }) => {
  // Отдельный пользователь, чтобы не менять пароль демо-владельцу.
  const email = uniqueEmail("reset");
  await registerOwner(page, email);
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
  await login(page, email, OWNER_PASSWORD);
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Неверный логин, email или пароль",
  );
  await login(page, email, "new-password-1");
  await expect(page).toHaveURL("/app");
});
