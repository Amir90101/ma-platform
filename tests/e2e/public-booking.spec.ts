import { expect, type Page, test } from "@playwright/test";
import { addDays, todayIn, zonedToUtc } from "../../src/lib/venue-time";
import { admin, seedPublicVenue } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

const TOMORROW = addDays(todayIn("Asia/Almaty"), 1);
const at = (time: string) =>
  zonedToUtc(TOMORROW, time, "Asia/Almaty").toISOString();

async function publicVenue(page: Page) {
  const email = uniqueEmail("guest");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedPublicVenue(email);
  // Дальше страница гостя: без входа в админку.
  await page.context().clearCookies();
  return venue;
}

async function pickSlot(page: Page, table: string, time: string) {
  const picker = page.getByTestId("booking-picker");
  await picker.getByRole("button", { name: "Завтра" }).click();
  await picker.getByRole("tab", { name: "Список" }).click();
  await page
    .locator(`[data-testid="slot-resource"][data-resource="${table}"]`)
    .getByRole("button", { name: new RegExp(`^${time}$`) })
    .click();
}

async function fillGuest(page: Page, name: string, phone: string) {
  const form = page.getByTestId("guest-form");
  await form.getByLabel("Имя", { exact: true }).fill(name);
  await form.getByLabel("Телефон", { exact: true }).fill(phone);
  await form.getByLabel("Сколько гостей").fill("3");
  await form.getByLabel("Согласен на обработку").check();
  // Тестовый ключ Turnstile проходит сам: ждём, пока кнопка станет активной.
  await expect(form.getByRole("button", { name: "Забронировать" })).toBeEnabled(
    { timeout: 20_000 },
  );
}

// Онлайн-бронь напрямую через Route Handler (тестовый ключ Turnstile
// принимает любой токен).
function apiBooking(
  page: Page,
  body: { resourceId: string; time: string; phone: string; consent?: boolean },
) {
  return page.request.post("/api/public-booking", {
    data: {
      resourceId: body.resourceId,
      startsAt: at(body.time),
      durationMin: 60,
      name: "Гость",
      phone: body.phone,
      guests: null,
      comment: "",
      consent: body.consent ?? true,
      turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
    },
  });
}

// Сценарий 15: бронь по ссылке с телефона.
test("гость бронирует стол с телефона и получает код и личную ссылку", async ({
  page,
}) => {
  const venue = await publicVenue(page);
  await page.goto(`/${venue.slug}`);
  await pickSlot(page, "Стол 1", "12:00");
  await expect(page.getByTestId("picked-slot")).toContainText(
    "Стол 1 · Завтра · 12:00–13:00",
  );
  await fillGuest(page, "Самал", "8 707 123 45 67");
  await page
    .getByTestId("guest-form")
    .getByRole("button", { name: "Забронировать" })
    .click();

  const done = page.getByTestId("booking-done");
  await expect(done).toContainText("Бронь подтверждена");
  await expect(done).toContainText("Стол 1 · Завтра · 12:00–13:00");
  await expect(done.getByTestId("booking-code")).toHaveText(
    /^Код брони: [0-9A-F]{8}$/,
  );
  await expect(
    done.getByRole("link", { name: "Открыть бронь" }),
  ).toHaveAttribute("href", /^\/b\/[0-9a-f]{36}$/);

  const { data: booking } = await admin
    .from("bookings")
    .select("status, source, guests, customers(name, phone, consent_at)")
    .eq("resource_id", venue.tables[0].id)
    .single();
  expect(booking).toMatchObject({
    status: "confirmed",
    source: "online",
    guests: 3,
    customers: { name: "Самал", phone: "+77071234567" },
  });
  expect(booking!.customers!.consent_at).not.toBeNull();
});

// Проверка 6.4: лимит на телефон и повторный гость.
test("третья активная бронь на тот же телефон отклоняется лимитом", async ({
  page,
}) => {
  const venue = await publicVenue(page);
  await page.goto(`/${venue.slug}`);

  const noConsent = await apiBooking(page, {
    resourceId: venue.tables[0].id,
    time: "10:00",
    phone: "+77070000010",
    consent: false,
  });
  expect(noConsent.status()).toBe(400);
  expect(await noConsent.json()).toEqual({
    ok: false,
    error: "consentRequired",
  });

  for (const time of ["10:00", "12:00"]) {
    const res = await apiBooking(page, {
      resourceId: venue.tables[0].id,
      time,
      phone: "+77070000010",
    });
    expect(res.status()).toBe(201);
  }

  await pickSlot(page, "Стол 2", "15:00");
  await fillGuest(page, "Тот же", "+7 707 000 00 10");
  await page
    .getByTestId("guest-form")
    .getByRole("button", { name: "Забронировать" })
    .click();
  await expect(page.getByTestId("guest-error")).toHaveText(
    "На этот номер уже есть активные брони. Отмените одну из них или позвоните в заведение.",
  );

  const { count } = await admin
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venue.venueId)
    .eq("phone", "+77070000010");
  expect(count).toBe(1);
});

test("окно заняли, пока гость заполнял форму: понятный отказ и новый выбор", async ({
  page,
}) => {
  const venue = await publicVenue(page);
  await page.goto(`/${venue.slug}`);
  await pickSlot(page, "Стол 3", "18:00");
  await fillGuest(page, "Поздний", "+7 707 000 00 20");

  const res = await apiBooking(page, {
    resourceId: venue.tables[2].id,
    time: "18:00",
    phone: "+77070000021",
  });
  expect(res.status()).toBe(201);

  await page
    .getByTestId("guest-form")
    .getByRole("button", { name: "Забронировать" })
    .click();
  await expect(page.getByTestId("slot-gone")).toHaveText(
    "Это время только что заняли. Выберите другое.",
  );
  await expect(page.getByTestId("guest-form")).toHaveCount(0);
  await expect(page.getByTestId("booking-picker")).toBeVisible();
  await expect(
    page
      .locator('[data-testid="slot-resource"][data-resource="Стол 3"]')
      .getByRole("button", { name: /^18:00$/ }),
  ).toHaveCount(0);
});
