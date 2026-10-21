import { expect, test } from "@playwright/test";
import {
  admin,
  backdateOpenSession,
  seedPublicVenue,
  signedInClient,
} from "./fixtures";
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
  // Круглосуточные часы работы: загрузка считается в любое время запуска.
  const venue = await seedPublicVenue(email);
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

  // Загрузка: оба стола заняты, остальные свободны.
  const load = page.getByTestId("load-resources");
  await expect(load.getByRole("row", { name: /Стол 1/ })).toBeVisible();
  await expect(load.getByRole("row", { name: /Стол 3/ })).toContainText("0 %");
});

// Проверка 7.2: неявки и доля онлайн-броней за месяц.
test("владелец видит неявки и долю онлайн-броней", async ({ page }) => {
  const email = uniqueEmail("noshow");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedPublicVenue(email);
  const { data: customer } = await admin
    .from("customers")
    .insert({ venue_id: venue.venueId, phone: "+77090000001", name: "Нурик" })
    .select("id")
    .single();
  // Две прошедшие брони этого месяца: онлайн — неявка, по звонку — пришёл.
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000);
  for (const [i, source, status] of [
    [0, "online", "no_show"],
    [1, "phone", "completed"],
  ] as const) {
    await admin.from("bookings").insert({
      venue_id: venue.venueId,
      resource_id: venue.tables[i].id,
      customer_id: customer!.id,
      starts_at: at(2).toISOString(),
      ends_at: at(1).toISOString(),
      blocked_until: at(1).toISOString(),
      source,
      status,
    });
  }

  await page.goto(`/app/${venue.venueId}/reports`);
  const stats = page.getByTestId("bookings-stats");
  await expect(stats.getByTestId("bookings-total")).toHaveText("2");
  await expect(stats.getByTestId("bookings-online")).toHaveText("1 · 50 %");
  await expect(stats.getByTestId("bookings-no-show")).toHaveText("1");
  await expect(stats.getByTestId("no-show-guests")).toContainText(
    "Нурик +77090000001",
  );
});
