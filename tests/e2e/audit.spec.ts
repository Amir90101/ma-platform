import { expect, type Page, test } from "@playwright/test";
import {
  addAdmin,
  backdateOpenSession,
  seedWorkVenue,
  signedInClient,
} from "./fixtures";
import { login, registerOwner, uniqueEmail } from "./helpers";

function resourceButton(page: Page, name: string) {
  return page
    .getByTestId("hall-resources")
    .getByRole("button", { name: new RegExp(`^${name}\\b`) });
}

// Проверка 4.5: после скидки и отмены оплаты владелец видит обе записи
// с автором; администратор экран не открывает.
test("журнал: скидка и отмена оплаты администратора видны владельцу", async ({
  page,
  browser,
}) => {
  const ownerEmail = uniqueEmail("audit");
  await registerOwner(page, ownerEmail);
  await page.waitForURL("/app");
  const venue = await seedWorkVenue(ownerEmail);
  const adminUser = await addAdmin(venue.venueId);

  // Администратор в своём браузере: смена, час игры, скидка 200, оплата.
  const adminPage = await (await browser.newContext()).newPage();
  await adminPage.goto("/login");
  await login(adminPage, adminUser.email, adminUser.password);
  await adminPage.waitForURL("/app");
  await adminPage.goto(`/app/${venue.venueId}/hall`);
  const shift = adminPage.getByTestId("shift-bar");
  await shift.getByLabel("Наличные в кассе, ₸").fill("0");
  await shift.getByRole("button", { name: "Открыть смену" }).click();
  await expect(shift).toContainText("В кассе на начало: 0 ₸");

  const panel = adminPage.getByTestId("resource-panel");
  await resourceButton(adminPage, "Стол 1").click();
  await panel.getByRole("button", { name: "Старт" }).click();
  await expect(panel.getByTestId("session-status")).toHaveText("Занят");
  await backdateOpenSession(venue.tables[0].id, 59);
  await adminPage.reload();
  await resourceButton(adminPage, "Стол 1").click();
  await panel.getByRole("button", { name: "Стоп" }).click();
  const checkout = panel.getByTestId("checkout");
  await checkout.getByLabel("Скидка, ₸").fill("200");
  await expect(checkout.getByTestId("receipt-total")).toHaveText("1000 ₸");
  await checkout.getByRole("button", { name: "Принять оплату" }).click();
  await expect(resourceButton(adminPage, "Стол 1")).toHaveAttribute(
    "data-state",
    "free",
  );

  // Отмена оплаты от имени администратора (кнопки в интерфейсе пока нет).
  const api = await signedInClient(adminUser.email, adminUser.password);
  const { data: payment } = await api
    .from("payments")
    .select("id")
    .eq("venue_id", venue.venueId)
    .single();
  const { error } = await api.rpc("void_payment", {
    p_payment_id: payment!.id,
    p_reason: "Ошиблись способом",
  });
  expect(error).toBeNull();

  // Владелец видит обе записи с автором.
  await page.goto(`/app/${venue.venueId}`);
  await page.getByRole("link", { name: "Журнал действий" }).click();
  const list = page.getByTestId("audit-list");
  const discount = list.getByRole("listitem").filter({
    has: page.getByText("Скидка", { exact: true }),
  });
  await expect(discount).toContainText("Скидка 200 ₸, итог 1000 ₸");
  await expect(discount).toContainText(`Кто: ${adminUser.email}`);
  const voided = list.getByRole("listitem").filter({
    has: page.getByText("Оплата отменена", { exact: true }),
  });
  await expect(voided).toContainText(
    "1000 ₸, наличные. Причина: Ошиблись способом",
  );
  await expect(voided).toContainText(`Кто: ${adminUser.email}`);

  // Администратор журнал не открывает.
  await adminPage.goto(`/app/${venue.venueId}`);
  await expect(
    adminPage.getByRole("link", { name: "Журнал действий" }),
  ).toHaveCount(0);
  await adminPage.goto(`/app/${venue.venueId}/audit`);
  await expect(adminPage).toHaveURL(`/app/${venue.venueId}`);
});
