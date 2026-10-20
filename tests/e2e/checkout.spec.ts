import { expect, type Page, test } from "@playwright/test";
import { backdateOpenSession, seedWorkVenue } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

function resourceButton(page: Page, name: string) {
  return page
    .getByTestId("hall-resources")
    .getByRole("button", { name: new RegExp(`^${name}\\b`) });
}

// Сценарии 7, 11, 14: смена, чек с товарами и скидкой, раздельная оплата,
// закрытие смены с ожидаемыми наличными.
test("смена, сеанс с товарами и скидкой, оплата наличными и Kaspi, закрытие смены", async ({
  page,
}) => {
  const email = uniqueEmail("checkout");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedWorkVenue(email);
  await page.goto(`/app/${venue.venueId}/hall`);

  const shift = page.getByTestId("shift-bar");
  const panel = page.getByTestId("resource-panel");
  await expect(shift).toContainText("Смена не открыта");

  // Стол запускается и без смены.
  await resourceButton(page, "Стол 1").click();
  await panel.getByRole("button", { name: "Старт" }).click();
  await expect(panel.getByTestId("session-status")).toHaveText("Занят");
  await backdateOpenSession(venue.tables[0].id, 59);
  await page.reload();
  await resourceButton(page, "Стол 1").click();

  // Чек: час по 1 200 ₸, кола 2 × 500, скидка 200.
  await panel.getByRole("button", { name: "Стоп" }).click();
  const checkout = panel.getByTestId("checkout");
  await expect(checkout.getByTestId("receipt-subtotal")).toHaveText("1200 ₸");
  await checkout.getByLabel("Товар").fill("Кола");
  await checkout.getByLabel("Цена, ₸").fill("500");
  await checkout.getByLabel("Кол-во").fill("2");
  await checkout.getByRole("button", { name: "Добавить" }).click();
  await expect(checkout.getByTestId("receipt-subtotal")).toHaveText("2200 ₸");
  await checkout.getByLabel("Скидка, ₸").fill("200");
  await expect(checkout.getByTestId("receipt-total")).toHaveText("2000 ₸");

  // Без смены оплату не принять (сценарий 7).
  await checkout.getByRole("button", { name: "Закрыть" }).click();
  await expect(checkout.getByTestId("work-error")).toHaveText(
    "Смена не открыта: откройте смену, чтобы принять оплату",
  );

  await shift.getByLabel("Наличные в кассе, ₸").fill("10000");
  await shift.getByRole("button", { name: "Открыть смену" }).click();
  await expect(shift).toContainText("В кассе на начало: 10000 ₸");

  // Раздельная оплата: 1 500 наличными и 500 Kaspi.
  await checkout.getByLabel("Сумма, ₸ 1").fill("1500");
  await checkout.getByRole("button", { name: "Разделить оплату" }).click();
  await expect(checkout.getByLabel("Оплата 2")).toHaveValue("kaspi");
  await expect(checkout.getByLabel("Сумма, ₸ 2")).toHaveValue("500");
  await checkout.getByRole("button", { name: "Закрыть" }).click();
  await expect(resourceButton(page, "Стол 1")).toHaveAttribute(
    "data-state",
    "free",
  );

  // Сценарий 14: закрытие смены, ожидаемые наличные сходятся.
  await shift.getByLabel("Наличные в кассе сейчас, ₸").fill("11500");
  await shift.getByRole("button", { name: "Закрыть смену" }).click();
  await expect(shift.getByRole("status")).toHaveText(
    "Смена закрыта. По системе: 11500 ₸, в кассе: 11500 ₸, разница: 0 ₸",
  );
  await expect(shift).toContainText("Смена не открыта");
});
