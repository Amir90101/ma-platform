import { expect, type Page, test } from "@playwright/test";
import { todayIn } from "../../src/lib/venue-time";
import { seedBooking, seedWorkVenue } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

function resourceButton(page: Page, name: string) {
  return page
    .getByTestId("hall-resources")
    .getByRole("button", { name: new RegExp(`^${name}\\b`) });
}

async function ownerVenue(page: Page) {
  const email = uniqueEmail("arrive");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  return seedWorkVenue(email);
}

// Сценарий 9: гость пришёл по брони.
test("«Пришёл» в ленте запускает сеанс на столе брони", async ({ page }) => {
  const venue = await ownerVenue(page);
  const { startsAt } = await seedBooking(venue.venueId, venue.tables[1].id, {
    startsInMin: 10,
    minutes: 120,
    phone: "+77030000001",
    name: "Дана",
  });

  await page.goto(
    `/app/${venue.venueId}/bookings?date=${todayIn("Asia/Almaty", startsAt)}`,
  );
  const booking = page
    .locator('[data-testid="feed-resource"][data-resource="Стол 2"]')
    .getByTestId("feed-booking");
  await booking.getByRole("button", { name: "Пришёл" }).click();
  await expect(booking.getByTestId("booking-status")).toHaveText("Пришёл");

  await booking.getByRole("link", { name: "Открыть карту" }).click();
  await expect(resourceButton(page, "Стол 2")).toHaveAttribute(
    "data-state",
    "busy",
  );
  await resourceButton(page, "Стол 2").click();
  const panel = page.getByTestId("resource-panel");
  await expect(panel.getByTestId("session-status")).toHaveText("Занят");
  await expect(panel).toContainText("Гость: Дана, +77030000001");
});

// Проверка 5.3: старт стола перед бронью показывает предупреждение.
test("стол с бронью через 30 минут предупреждает и запускается по «Пришёл»", async ({
  page,
}) => {
  const venue = await ownerVenue(page);
  await seedBooking(venue.venueId, venue.tables[0].id, {
    startsInMin: 30,
    minutes: 60,
    phone: "+77030000002",
    name: "Нурлан",
  });

  await page.goto(`/app/${venue.venueId}/hall`);
  await resourceButton(page, "Стол 1").click();
  const notice = page.getByTestId("booking-notice");
  await expect(notice).toContainText(/стол свободен (29|30) мин/);
  await expect(notice).toContainText("Гость брони: Нурлан, +77030000002");

  // У стола без брони предупреждения нет.
  await resourceButton(page, "Стол 3").click();
  await expect(page.getByTestId("booking-notice")).toHaveCount(0);

  await resourceButton(page, "Стол 1").click();
  await notice.getByRole("button", { name: "Пришёл" }).click();
  await expect(resourceButton(page, "Стол 1")).toHaveAttribute(
    "data-state",
    "busy",
  );
  await expect(page.getByTestId("resource-panel")).toContainText(
    "Гость: Нурлан, +77030000002",
  );
  await expect(page.getByTestId("booking-notice")).toHaveCount(0);
});
