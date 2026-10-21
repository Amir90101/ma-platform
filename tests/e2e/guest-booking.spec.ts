import { expect, type Page, test } from "@playwright/test";
import { addDays, todayIn, zonedToUtc } from "../../src/lib/venue-time";
import { admin, seedPublicVenue } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

const TOMORROW = addDays(todayIn("Asia/Almaty"), 1);

// Владелец с опубликованным заведением на ленте броней завтрашнего дня,
// уведомления и обновления ленты подключены.
async function ownerOnFeed(page: Page) {
  const email = uniqueEmail("alerts");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedPublicVenue(email);
  await page.goto(`/app/${venue.venueId}/bookings?date=${TOMORROW}`);
  await expect(page.getByTestId("booking-feed")).toHaveAttribute(
    "data-realtime",
    "on",
  );
  await expect(page.getByTestId("online-alerts")).toHaveAttribute(
    "data-realtime",
    "on",
  );
  return venue;
}

async function guestBooks(
  page: Page,
  resourceId: string,
  time: string,
  guest = { name: "Самал", phone: "+77071112233" },
) {
  const res = await page.request.post("/api/public-booking", {
    data: {
      resourceId,
      startsAt: zonedToUtc(TOMORROW, time, "Asia/Almaty").toISOString(),
      durationMin: 120,
      name: guest.name,
      phone: guest.phone,
      guests: 4,
      comment: "",
      consent: true,
      turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { token: string; code: string };
}

// Сценарий 13: новая онлайн-бронь появляется в админке без перезагрузки.
test("администратор видит уведомление о новой онлайн-брони", async ({
  page,
}) => {
  const venue = await ownerOnFeed(page);
  await guestBooks(page, venue.tables[1].id, "19:00");

  const alert = page.getByTestId("online-booking-alert");
  await expect(alert).toContainText("Новая онлайн-бронь");
  await expect(alert).toContainText("Стол 2");
  await expect(alert).toContainText("19:00–21:00");
  await expect(alert).toContainText("Самал · +77071112233 · 4 гостя");

  const booking = page
    .locator('[data-testid="feed-resource"][data-resource="Стол 2"]')
    .getByTestId("feed-booking");
  await expect(booking).toContainText("19:00–21:00");
  await expect(booking).toContainText("онлайн");

  await alert.getByRole("button", { name: "Закрыть" }).click();
  await expect(alert).toHaveCount(0);
});

// Сценарий 16: гость отменяет бронь по ссылке, админка видит отмену.
test("гость отменяет бронь по личной ссылке", async ({ page, browser }) => {
  const venue = await ownerOnFeed(page);
  const { token, code } = await guestBooks(page, venue.tables[0].id, "20:00");

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/b/${token}`);
  await expect(guest.getByText(`Бронь ${code}`)).toBeVisible();
  await expect(guest.getByTestId("guest-booking-status")).toHaveText(
    "Подтверждена",
  );
  await expect(guest.getByTestId("guest-booking")).toContainText("Стол 1");
  await expect(guest.getByTestId("guest-booking")).toContainText("20:00–22:00");
  // Имени и телефона гостя на странице нет.
  await expect(guest.getByTestId("guest-booking")).not.toContainText("Самал");

  await guest.getByRole("button", { name: "Отменить бронь" }).click();
  await guest.getByRole("button", { name: "Да, отменить" }).click();
  await expect(guest.getByTestId("guest-booking-status")).toHaveText(
    "Отменена вами",
  );
  await expect(
    guest.getByRole("button", { name: "Отменить бронь" }),
  ).toHaveCount(0);

  const booking = page
    .locator('[data-testid="feed-resource"][data-resource="Стол 1"]')
    .getByTestId("feed-booking");
  await expect(booking.getByTestId("booking-status")).toHaveText("Отменена");
  await expect(booking).toContainText("Отменил гость");
});

test("после начала брони отмена по ссылке недоступна; неверная ссылка", async ({
  page,
}) => {
  const email = uniqueEmail("late");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedPublicVenue(email);
  const { data: customer } = await admin
    .from("customers")
    .insert({ venue_id: venue.venueId, phone: "+77071112244", name: "Опоздал" })
    .select("id")
    .single();
  const startsAt = new Date(Date.now() - 5 * 60_000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  const { data: booking } = await admin
    .from("bookings")
    .insert({
      venue_id: venue.venueId,
      resource_id: venue.tables[0].id,
      customer_id: customer!.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      blocked_until: endsAt.toISOString(),
      source: "online",
    })
    .select("manage_token")
    .single();

  await page.goto(`/b/${booking!.manage_token}`);
  await expect(page.getByTestId("cancel-too-late")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Отменить бронь" }),
  ).toHaveCount(0);

  await page.goto("/b/not-a-real-token");
  await expect(
    page.getByRole("heading", { name: "Бронь не найдена" }),
  ).toBeVisible();
});
