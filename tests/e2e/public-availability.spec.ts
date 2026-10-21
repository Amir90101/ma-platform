import { expect, type Page, test } from "@playwright/test";
import { addDays, todayIn, zonedToUtc } from "../../src/lib/venue-time";
import { admin, seedPublicVenue } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

const TOMORROW = addDays(todayIn("Asia/Almaty"), 1);

function slotsOf(page: Page, table: string) {
  return page
    .locator(`[data-testid="slot-resource"][data-resource="${table}"]`)
    .getByRole("button");
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
  await picker.getByRole("button", { name: "Завтра" }).click();
  await picker.getByRole("tab", { name: "Список" }).click();
  await expect(page.getByTestId("availability")).toHaveAttribute(
    "data-state",
    "ready",
  );
  // Круглосуточно, по часу: 24 начала с шагом 30 минут минус последнее.
  await expect(slotsOf(page, "Стол 1")).toHaveCount(47);
  await expect(
    slotsOf(page, "Стол 1").filter({ hasText: /^12:00$/ }),
  ).toHaveCount(1);

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
  await picker
    .getByLabel("Сколько по времени")
    .selectOption({ label: "1 ч 30 мин" });
  await picker.getByLabel("Сколько по времени").selectOption({ label: "1 ч" });
  await expect(slotsOf(page, "Стол 1")).toHaveCount(42);
  for (const time of ["11:30", "12:00", "12:30", "13:00", "13:30"]) {
    await expect(
      slotsOf(page, "Стол 1").filter({ hasText: new RegExp(`^${time}$`) }),
    ).toHaveCount(0);
  }
  await expect(
    slotsOf(page, "Стол 1").filter({ hasText: /^11:00$/ }),
  ).toHaveCount(1);
  await expect(
    slotsOf(page, "Стол 1").filter({ hasText: /^14:00$/ }),
  ).toHaveCount(1);
  await expect(
    slotsOf(page, "Стол 2").filter({ hasText: /^12:00$/ }),
  ).toHaveCount(1);

  // Выбор окна.
  await slotsOf(page, "Стол 2")
    .filter({ hasText: /^12:00$/ })
    .click();
  await expect(page.getByTestId("picked-slot")).toContainText(
    "Стол 2 · Завтра · 12:00–13:00",
  );
});
