import { expect, test } from "@playwright/test";

test("главная страница открывается", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("приложение достаёт до базы", async ({ page }) => {
  await page.goto("/health");
  await expect(page.getByTestId("db-status")).toContainText("База доступна");
});
