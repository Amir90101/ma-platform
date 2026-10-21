import { expect, type Page, test } from "@playwright/test";
import { addDays, todayIn, zonedToUtc } from "../../src/lib/venue-time";
import { admin, seedWorkVenue } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

// Лента завтрашнего дня: брони не упираются в «бронь в прошлом».
const TOMORROW = addDays(todayIn("Asia/Almaty"), 1);

async function openFeed(page: Page) {
  const email = uniqueEmail("bookings");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedWorkVenue(email);
  await page.goto(`/app/${venue.venueId}/bookings?date=${TOMORROW}`);
  await expect(page.getByTestId("booking-feed")).toHaveAttribute(
    "data-realtime",
    "on",
  );
  return venue;
}

async function book(
  page: Page,
  b: {
    table: string;
    start: string;
    end: string;
    phone: string;
    name?: string;
  },
) {
  const form = page.getByTestId("booking-form");
  await form
    .getByLabel("Стол", { exact: true })
    .selectOption({ label: b.table });
  await form.getByLabel("Начало").fill(b.start);
  await form.getByLabel("Конец").fill(b.end);
  await form.getByLabel("Телефон гостя").fill(b.phone);
  await form.getByLabel("Имя гостя").fill(b.name ?? "");
  await form.getByRole("button", { name: "Забронировать" }).click();
}

function feedResource(page: Page, name: string) {
  return page.locator(`[data-testid="feed-resource"][data-resource="${name}"]`);
}

// Сценарий 12: бронь по звонку и отказ при пересечении.
test("бронь по звонку, отказ при пересечении с названием мешающей брони", async ({
  page,
}) => {
  await openFeed(page);

  await book(page, {
    table: "Стол 1",
    start: "14:00",
    end: "16:00",
    phone: "8 701 000 00 01",
    name: "Ержан",
  });
  await expect(page.getByTestId("booking-created")).toHaveText(
    "Бронь создана: Стол 1, 14:00–16:00",
  );
  const first = feedResource(page, "Стол 1").getByTestId("feed-booking");
  await expect(first).toContainText("14:00–16:00");
  await expect(first).toContainText("Ержан");
  await expect(first).toContainText("+77010000001");
  await expect(first.getByTestId("booking-status")).toHaveText("Подтверждена");

  await book(page, {
    table: "Стол 1",
    start: "15:00",
    end: "17:00",
    phone: "8 701 000 00 02",
  });
  await expect(page.getByTestId("booking-form-error")).toHaveText(
    "Время занято: бронь Ержан, 14:00–16:00",
  );
  await expect(
    feedResource(page, "Стол 1").getByTestId("feed-booking"),
  ).toHaveCount(1);

  // То же время на другом столе свободно.
  await book(page, {
    table: "Стол 2",
    start: "15:00",
    end: "17:00",
    phone: "8 701 000 00 02",
  });
  await expect(page.getByTestId("booking-created")).toHaveText(
    "Бронь создана: Стол 2, 15:00–17:00",
  );
  await expect(page.getByTestId("feed-count")).toHaveText("2 брони");

  // Отмена с причиной освобождает стол.
  await first.getByRole("button", { name: "Отменить" }).click();
  await first.getByRole("button", { name: "Отменить бронь" }).click();
  await expect(first.getByTestId("booking-error")).toHaveText(
    "Укажите причину",
  );
  await first.getByLabel("Причина отмены").fill("Гость перенёс");
  await first.getByRole("button", { name: "Отменить бронь" }).click();
  await expect(first.getByTestId("booking-status")).toHaveText("Отменена");
  await expect(first).toContainText("Причина: Гость перенёс");

  await book(page, {
    table: "Стол 1",
    start: "15:00",
    end: "17:00",
    phone: "8 701 000 00 02",
  });
  await expect(page.getByTestId("booking-created")).toHaveText(
    "Бронь создана: Стол 1, 15:00–17:00",
  );
});

test("лента показывает прошлые неявки гостя и обновляется во втором окне", async ({
  page,
}) => {
  const venue = await openFeed(page);
  const second = await page.context().newPage();
  await second.goto(page.url());
  await expect(second.getByTestId("booking-feed")).toHaveAttribute(
    "data-realtime",
    "on",
  );

  // Гость уже дважды не пришёл.
  const { data: customer } = await admin
    .from("customers")
    .insert({ venue_id: venue.venueId, phone: "+77010000003", name: "Опоздун" })
    .select("id")
    .single();
  const past = (days: number) => {
    const at = zonedToUtc(addDays(TOMORROW, -days), "12:00", "Asia/Almaty");
    return {
      venue_id: venue.venueId,
      resource_id: venue.tables[3].id,
      customer_id: customer!.id,
      starts_at: at.toISOString(),
      ends_at: new Date(at.getTime() + 3_600_000).toISOString(),
      blocked_until: new Date(at.getTime() + 3_600_000).toISOString(),
      source: "phone" as const,
      status: "no_show" as const,
    };
  };
  await admin.from("bookings").insert([past(5), past(9)]);

  await book(page, {
    table: "Стол 3",
    start: "20:00",
    end: "22:00",
    phone: "+7 701 000 00 03",
  });
  const booking = feedResource(second, "Стол 3").getByTestId("feed-booking");
  await expect(booking).toContainText("20:00–22:00");
  await expect(booking).toContainText("Опоздун");
  await expect(booking.getByTestId("booking-no-shows")).toHaveText(
    "Раньше не пришёл: 2 раза",
  );
  // Будущая бронь: отметить неявку ещё нельзя.
  await expect(booking.getByRole("button", { name: "Не пришёл" })).toHaveCount(
    0,
  );
});
