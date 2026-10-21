import { expect, test } from "@playwright/test";
import { backdateOpenSession, seedWorkVenue, signedInClient } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

// Сеанс на столе: час игры, пауза (сумма перестаёт расти), оплата частями.
async function playedHour(
  client: Awaited<ReturnType<typeof signedInClient>>,
  resourceId: string,
  split: (total: number) => { amount: number; method: string }[],
) {
  const { data: sessionId } = await client.rpc("start_session", {
    p_resource_id: resourceId,
  });
  await backdateOpenSession(resourceId, 60);
  await client.rpc("pause_session", { p_session_id: sessionId! });
  const { data: amount } = await client.rpc("calc_session_amount", {
    p_session_id: sessionId!,
  });
  const total = (amount as { total_amount: number }).total_amount;
  const { error } = await client.rpc("checkout_session", {
    p_session_id: sessionId!,
    p_discount_amount: 0,
    p_payments: split(total),
  });
  expect(error).toBeNull();
  return total;
}

// Проверка 7.1: выручка за сегодня по способам оплаты, столам и дню.
test("владелец видит выручку за период", async ({ page }) => {
  const email = uniqueEmail("reports");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedWorkVenue(email);
  const owner = await signedInClient(email, "test-password-1");
  await owner.rpc("open_shift", {
    p_venue_id: venue.venueId,
    p_opening_cash: 0,
  });

  const first = await playedHour(owner, venue.tables[0].id, (total) => [
    { amount: total - 500, method: "cash" },
    { amount: 500, method: "kaspi" },
  ]);
  const second = await playedHour(owner, venue.tables[1].id, (total) => [
    { amount: total, method: "card" },
  ]);
  const money = (n: number) => `${n.toLocaleString("ru-RU")} ₸`;

  await page.goto(`/app/${venue.venueId}`);
  await page.getByRole("link", { name: "Отчёты" }).click();
  await page.getByRole("link", { name: "Сегодня" }).click();
  await expect(page.getByTestId("revenue-total")).toHaveText(
    money(first + second),
  );
  await expect(page.getByTestId("revenue-cash")).toHaveText(money(first - 500));
  await expect(page.getByTestId("revenue-kaspi")).toHaveText(money(500));
  await expect(page.getByTestId("revenue-card")).toHaveText(money(second));

  const resources = page.getByTestId("revenue-resources");
  await expect(resources.getByRole("row", { name: /Стол 1/ })).toContainText(
    money(first),
  );
  await expect(resources.getByRole("row", { name: /Стол 2/ })).toContainText(
    money(second),
  );
  await expect(
    page.getByTestId("revenue-days").getByRole("row").nth(1),
  ).toContainText(money(first + second));
});
