import { expect, type Page, test } from "@playwright/test";
import { addDays, todayIn, zonedToUtc } from "../../src/lib/venue-time";
import { admin, seedPublicVenue } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

const TOMORROW = addDays(todayIn("Asia/Almaty"), 1);

function times(page: Page) {
  return page.getByTestId("time-slots").getByRole("button");
}

function time(page: Page, value: string) {
  return times(page).filter({ hasText: new RegExp(`^${value}`) });
}

function seat(page: Page, table: string) {
  return page
    .getByTestId("seat-list")
    .getByRole("button", { name: table, exact: true });
}

// Проверка 6.3: стол, занятый бронью в админке, теряет это окно на
// публичной странице.
test("гость видит свободные окна; бронь из админки убирает окно", async ({
  page,
}) => {
  const email = uniqueEmail("public");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedPublicVenue(email);

  await page.goto(`/${venue.slug}`);
  await page.getByRole("link", { name: "Забронировать" }).click();
  const picker = page.getByTestId("booking-picker");
  await picker.getByRole("button", { name: "Завтра", exact: true }).click();
  await expect(page.getByTestId("availability")).toHaveAttribute(
    "data-state",
    "ready",
  );
  // Круглосуточно, по часу: 24 начала с шагом 30 минут минус последнее.
  await expect(times(page)).toHaveCount(47);
  await expect(time(page, "12:00")).toContainText("3 места");

  // Администратор занимает Стол 1 завтра 12:00–14:00.
  const { data: customer } = await admin
    .from("customers")
    .insert({ venue_id: venue.venueId, phone: "+77060000001", name: "Звонок" })
    .select("id")
    .single();
  const startsAt = zonedToUtc(TOMORROW, "12:00", "Asia/Almaty");
  const endsAt = zonedToUtc(TOMORROW, "14:00", "Asia/Almaty");
  await admin.from("bookings").insert({
    venue_id: venue.venueId,
    resource_id: venue.tables[0].id,
    customer_id: customer!.id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    blocked_until: endsAt.toISOString(),
    source: "phone",
  });

  // Сменили длительность туда и обратно — окна перечитаны.
  await picker.getByRole("button", { name: "1 ч 30 мин", exact: true }).click();
  await picker.getByRole("button", { name: "1 ч", exact: true }).click();
  await expect(time(page, "12:00")).toContainText("2 места");
  await expect(time(page, "11:00")).toContainText("3 места");
  await expect(time(page, "14:00")).toContainText("3 места");

  // На 12:00 Стол 1 занят, Стол 2 свободен.
  await time(page, "12:00").click();
  await picker.getByRole("button", { name: "Выбрать место" }).click();
  await expect(seat(page, "Стол 1")).toBeDisabled();
  await expect(seat(page, "Стол 2")).toBeEnabled();

  // На 11:00 Стол 1 ещё свободен.
  await picker.getByRole("button", { name: "Назад к дате и времени" }).click();
  await time(page, "11:00").click();
  await picker.getByRole("button", { name: "Выбрать место" }).click();
  await expect(seat(page, "Стол 1")).toBeEnabled();

  // Выбор места и времени.
  await picker.getByRole("button", { name: "Назад к дате и времени" }).click();
  await time(page, "12:00").click();
  await picker.getByRole("button", { name: "Выбрать место" }).click();
  await seat(page, "Стол 2").click();
  await expect(seat(page, "Стол 2")).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByTestId("picked-slot")).toContainText(
    "Стол 2 · Завтра · 12:00–13:00",
  );
});
