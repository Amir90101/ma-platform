import { expect, type Page, test } from "@playwright/test";
import { backdateOpenSession, seedWorkVenue } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

function resourceButton(page: Page, name: string) {
  return page
    .getByTestId("hall-resources")
    .getByRole("button", { name: new RegExp(`^${name}\\b`) });
}

async function openWorkScreen(page: Page) {
  const email = uniqueEmail("work");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedWorkVenue(email);
  await page.goto(`/app/${venue.venueId}/hall`);
  return venue;
}

// Сценарий 8: гость без брони.
test("администратор запускает стол, видит таймер и сумму", async ({ page }) => {
  const venue = await openWorkScreen(page);

  await resourceButton(page, "Стол 1").click();
  const panel = page.getByTestId("resource-panel");
  await panel
    .getByLabel("Ожидаемое окончание")
    .selectOption({ label: "через 1 час" });
  await panel.getByLabel("Имя гостя").fill("Арман");
  await panel.getByLabel("Телефон гостя").fill("123");
  await panel.getByRole("button", { name: "Старт" }).click();
  await expect(panel.getByTestId("work-error")).toHaveText(
    "Телефон в формате +7 700 000 00 00",
  );
  await panel.getByLabel("Телефон гостя").fill("8 700 123 45 67");
  await panel.getByRole("button", { name: "Старт" }).click();

  await expect(resourceButton(page, "Стол 1")).toHaveAttribute(
    "data-state",
    "busy",
  );
  await expect(panel.getByTestId("session-status")).toHaveText("Занят");
  await expect(panel).toContainText("Гость: Арман, +77001234567");
  await expect(panel.getByTestId("session-timer")).toHaveText(/^0:00:\d\d$/);

  // Сеанс «шёл» 59 минут: сумма из базы и таймер браузера сходятся.
  await backdateOpenSession(venue.tables[0].id, 59);
  await page.reload();
  await resourceButton(page, "Стол 1").click();
  await expect(panel.getByTestId("session-timer")).toHaveText(/^0:59:\d\d$/);
  await expect(panel.getByTestId("session-amount")).toHaveText("1200 ₸");
});

// Сценарий 10: пауза и перенос, затем остановка.
test("пауза, продолжение, перенос на другой стол и остановка", async ({
  page,
}) => {
  await openWorkScreen(page);
  const panel = page.getByTestId("resource-panel");

  await resourceButton(page, "Стол 1").click();
  await panel.getByRole("button", { name: "Старт" }).click();
  await expect(panel.getByTestId("session-status")).toHaveText("Занят");

  await panel.getByRole("button", { name: "Пауза" }).click();
  await expect(panel.getByTestId("session-status")).toHaveText("Пауза");
  await expect(resourceButton(page, "Стол 1")).toHaveAttribute(
    "data-state",
    "paused",
  );

  await panel.getByRole("button", { name: "Продолжить" }).click();
  await expect(panel.getByTestId("session-status")).toHaveText("Занят");

  await panel
    .getByLabel("На какой стол")
    .selectOption({ label: "Стол 2 · Зал" });
  await panel.getByRole("button", { name: "Перенести" }).click();
  await expect(resourceButton(page, "Стол 1")).toHaveAttribute(
    "data-state",
    "free",
  );
  await expect(resourceButton(page, "Стол 2")).toHaveAttribute(
    "data-state",
    "busy",
  );
  // Панель перешла на новый стол.
  await expect(panel.getByRole("heading")).toHaveText("Стол 2");

  // «Стоп» ставит на паузу и открывает чек; «Вернуться к игре» продолжает.
  await panel.getByRole("button", { name: "Стоп" }).click();
  await expect(panel.getByTestId("checkout")).toBeVisible();
  await expect(resourceButton(page, "Стол 2")).toHaveAttribute(
    "data-state",
    "paused",
  );
  await panel.getByRole("button", { name: "Вернуться к игре" }).click();
  await expect(panel.getByTestId("session-status")).toHaveText("Занят");
});
