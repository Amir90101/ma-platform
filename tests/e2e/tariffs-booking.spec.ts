import { expect, type Page, test } from "@playwright/test";
import { admin, seedPublicVenue, seedWorkVenue } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

async function addPackage(
  venueId: string,
  name: string,
  minutes: number,
  price: number,
) {
  const { data } = await admin
    .from("packages")
    .insert({
      venue_id: venueId,
      name,
      resource_kinds: ["pool_table"],
      minutes,
      price,
    })
    .select("id")
    .single();
  return data!.id;
}

function resourceButton(page: Page, name: string) {
  return page
    .getByTestId("hall-resources")
    .getByRole("button", { name: new RegExp(`^${name}\\b`) });
}

// Администратор запускает место по тарифу: тариф задаёт время и цену.
test("старт стола по тарифу вместо времени", async ({ page }) => {
  const email = uniqueEmail("tariff");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedWorkVenue(email);
  const packageId = await addPackage(venue.venueId, "2 часа", 120, 2000);

  await page.goto(`/app/${venue.venueId}/hall`);
  await resourceButton(page, "Стол 1").click();
  const panel = page.getByTestId("resource-panel");
  // Пока тариф не выбран, запустить нельзя.
  await expect(
    panel.getByRole("button", { name: "Выберите тариф" }),
  ).toBeDisabled();
  await panel.getByRole("radio", { name: /2 часа/ }).check();
  await panel.getByRole("button", { name: "Старт" }).click();
  await expect(resourceButton(page, "Стол 1")).toHaveAttribute(
    "data-state",
    "busy",
  );

  const { data: session } = await admin
    .from("sessions")
    .select("package_id, started_at, expected_end_at")
    .eq("venue_id", venue.venueId)
    .single();
  expect(session!.package_id).toBe(packageId);
  const minutes =
    (Date.parse(session!.expected_end_at!) - Date.parse(session!.started_at)) /
    60_000;
  expect(Math.round(minutes)).toBe(120);

  // Поминутно: тариф не нужен, можно указать окончание.
  await resourceButton(page, "Стол 2").click();
  await panel.getByRole("radio", { name: /Поминутно/ }).check();
  await expect(panel.getByLabel("Ожидаемое окончание")).toBeVisible();
  await panel.getByRole("button", { name: "Старт" }).click();
  await expect(resourceButton(page, "Стол 2")).toHaveAttribute(
    "data-state",
    "busy",
  );
});

// Гость выбирает тариф на странице брони.
test("гость бронирует по тарифу", async ({ page }) => {
  const email = uniqueEmail("guest-tariff");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedPublicVenue(email);
  const packageId = await addPackage(venue.venueId, "3 часа", 180, 4000);
  await page.context().clearCookies();

  await page.goto(`/${venue.slug}`);
  const picker = page.getByTestId("booking-picker");
  // Первый тариф выбран сразу, длительность не спрашиваем.
  await expect(picker.getByRole("radio", { name: /3 часа/ })).toBeChecked();
  await expect(picker.getByLabel("Сколько по времени")).toHaveCount(0);
  await picker.getByRole("button", { name: "Завтра" }).click();
  await picker.getByRole("tab", { name: "Список" }).click();
  await page
    .locator('[data-testid="slot-resource"][data-resource="Стол 1"]')
    .getByRole("button", { name: /^12:00$/ })
    .click();
  await expect(page.getByTestId("picked-slot")).toContainText(
    "3 часа, 4 000 ₸ · Стол 1 · Завтра · 12:00–15:00",
  );

  const form = page.getByTestId("guest-form");
  await form.getByLabel("Имя", { exact: true }).fill("Асель");
  await form.getByLabel("Телефон", { exact: true }).fill("+7 708 000 00 01");
  await form.getByLabel("Согласен на обработку").check();
  const submit = form.getByRole("button", { name: "Забронировать" });
  await expect(submit).toBeEnabled({ timeout: 20_000 });
  await submit.click();
  await expect(page.getByTestId("booking-done")).toContainText(
    "Бронь подтверждена",
  );

  const { data: booking } = await admin
    .from("bookings")
    .select("package_id, starts_at, ends_at")
    .eq("venue_id", venue.venueId)
    .single();
  expect(booking!.package_id).toBe(packageId);
  expect(
    (Date.parse(booking!.ends_at) - Date.parse(booking!.starts_at)) / 60_000,
  ).toBe(180);
});
