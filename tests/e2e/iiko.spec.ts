import http from "node:http";
import { expect, test } from "@playwright/test";
import { addDays, todayIn } from "../../src/lib/venue-time";
import { admin } from "./fixtures";
import {
  login,
  OWNER_PASSWORD,
  PLATFORM,
  uniqueEmail,
  uniqueSuffix,
} from "./helpers";

// Фиктивный iikoCloud API на адресе из IIKO_API_BASE (.env.local, CI).
const PORT = 3998;
const ORG = "11111111-0000-4000-8000-000000000001";
const TG = "11111111-0000-4000-8000-000000000002";
const SECTION = "11111111-0000-4000-8000-000000000003";
const T1 = "11111111-0000-4000-8000-0000000000a1";
const T2 = "11111111-0000-4000-8000-0000000000a2";
const TOMORROW = addDays(todayIn("Asia/Almaty"), 1);

function fakeIiko() {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      const path = req.url ?? "";
      calls.push({ path, body });
      const reply = (data: object) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ correlationId: ORG, ...data }));
      };
      if (path === "/api/1/access_token") return reply({ token: "e2e" });
      if (req.headers.authorization !== "Bearer e2e") {
        res.statusCode = 401;
        return reply({ errorDescription: "unauthorized" });
      }
      switch (path) {
        case "/api/1/reserve/available_organizations":
          return reply({ organizations: [{ id: ORG, name: "Клуб iiko" }] });
        case "/api/1/reserve/available_terminal_groups":
          return reply({
            terminalGroups: [
              { organizationId: ORG, items: [{ id: TG, name: "Касса" }] },
            ],
          });
        case "/api/1/reserve/available_restaurant_sections":
          return reply({
            restaurantSections: [
              {
                id: SECTION,
                name: "Основной",
                tables: [
                  {
                    id: T1,
                    number: 1,
                    name: "Стол A",
                    seatingCapacity: 4,
                    isDeleted: false,
                  },
                  {
                    id: T2,
                    number: 2,
                    name: "Стол B",
                    seatingCapacity: 6,
                    isDeleted: false,
                  },
                ],
              },
            ],
          });
        case "/api/1/reserve/restaurant_sections_workload":
          // Стол A завтра 12:00–14:00 занят бронью прямо в кассе.
          return reply({
            reserves: [
              {
                id: "11111111-0000-4000-8000-0000000000f1",
                tableIds: [T1],
                estimatedStartTime: `${TOMORROW} 12:00:00.000`,
                durationInMinutes: 120,
                guestsCount: 2,
              },
            ],
          });
        case "/api/1/reserve/create":
          return reply({ reserveInfo: { creationStatus: "Success" } });
        case "/api/1/reserve/cancel":
          return reply({});
      }
      res.statusCode = 404;
      reply({ errorDescription: "not found" });
    });
  });
  return {
    calls,
    start: () =>
      new Promise<void>((r) => server.listen(PORT, "127.0.0.1", () => r())),
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}

test("владелец платформы подключает заведение сразу с iiko; занятость из кассы, бронь и отмена уходят в iiko", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "один фиктивный iiko на порту 3998",
  );
  test.setTimeout(120_000);
  const iiko = fakeIiko();
  await iiko.start();
  try {
    // Владелец уже есть в системе: заведение появится у него после входа.
    const ownerEmail = uniqueEmail("iiko-owner");
    await admin.auth.admin.createUser({
      email: ownerEmail,
      password: OWNER_PASSWORD,
      email_confirm: true,
    });

    // Владелец платформы: заведение и касса iiko в одной форме.
    await page.goto("/login");
    await login(page, PLATFORM.email, PLATFORM.password);
    await page.waitForURL("/admin");
    await page.goto("/admin/new");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email владельца заведения").fill(ownerEmail);
    await page.getByLabel("Название организации").fill("ТОО Караоке iiko");
    await page.getByLabel("Тип заведения").selectOption({ label: "Караоке" });
    await page.getByLabel("Название", { exact: true }).fill("Караоке iiko");
    const slug = `iiko-${uniqueSuffix()}`;
    await page.getByLabel("Адрес страницы").fill(slug);
    await page.getByLabel("Город").fill("Алматы");
    await page.getByLabel("Круглосуточно, без выходных").check();
    await page.getByLabel("iiko — только онлайн-бронь").check();
    const fields = page.getByTestId("iiko-fields");
    await fields.getByLabel("Ключ API iiko").fill("e2e-api-login");
    await fields.getByRole("button", { name: "Проверить ключ" }).click();
    await fields.getByLabel("Организация").selectOption({ label: "Клуб iiko" });
    await fields
      .getByLabel("Группа терминалов")
      .selectOption({ label: "Касса" });
    await expect(fields.getByText("Основной · столов: 2")).toBeVisible();
    await page.getByRole("button", { name: "Создать заведение" }).click();
    await expect(page).toHaveURL(`/admin?created=${slug}`);
    const card = page
      .getByTestId("platform-venue")
      .filter({ hasText: ownerEmail });
    await expect(card).toContainText("iiko");
    await expect(card).toContainText("Места · 2");

    // Публикуем и задаём цену — это делает владелец заведения, здесь сразу.
    const { data: venue } = await admin
      .from("venues")
      .update({ is_published: true })
      .eq("slug", slug)
      .select("id, booking_only")
      .single();
    expect(venue!.booking_only).toBe(true);
    await admin.from("tariffs").insert({
      venue_id: venue!.id,
      name: "Сутки",
      resource_kinds: ["karaoke_room"],
      price_per_hour: 3000,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      time_from: "00:00",
      time_to: "00:00",
    });

    // Владелец заведения видит интеграцию, но не меняет её.
    const owner = await (await browser.newContext()).newPage();
    await owner.goto("/login");
    await login(owner, ownerEmail, OWNER_PASSWORD);
    await owner.waitForURL("/app");
    await owner.goto(`/app/${venue!.id}/settings/integration`);
    const readonly = owner.getByTestId("integration-readonly");
    await expect(readonly).toContainText("Только онлайн-бронь");
    await expect(readonly).toContainText("Обмен с iiko включён · столов: 2");
    await expect(owner.getByLabel("Ключ API iiko")).toHaveCount(0);
    await expect(owner.getByLabel("Только онлайн-бронь")).toHaveCount(0);
    await expect(
      owner.getByRole("navigation", { name: "Разделы заведения" }).first(),
    ).not.toContainText("Карта зала");

    // Гость: завтра 12:00 Стол A занят в iiko, Стол B свободен.
    const guestPage = await (await browser.newContext()).newPage();
    await guestPage.goto(`/${slug}`);
    const picker = guestPage.getByTestId("booking-picker");
    await picker.getByRole("button", { name: "Завтра", exact: true }).click();
    await guestPage
      .getByTestId("time-slots")
      .getByRole("button")
      .filter({ hasText: /^12:00/ })
      .click();
    await picker.getByRole("button", { name: "Выбрать место" }).click();
    const seat = (name: string) =>
      guestPage
        .getByTestId("seat-list")
        .getByRole("button", { name, exact: true });
    await expect(seat("Стол A")).toBeDisabled();
    await seat("Стол B").click();
    await picker.getByRole("button", { name: "Далее" }).click();

    const guest = guestPage.getByTestId("guest-form");
    await guest.getByLabel("Имя", { exact: true }).fill("Гость iiko");
    await guest.getByLabel("Телефон", { exact: true }).fill("+7 707 111 22 33");
    await guest.getByLabel("Согласен на обработку").check();
    const submit = guest.getByRole("button", { name: "Забронировать" });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();
    await expect(guestPage.getByTestId("booking-done")).toContainText(
      "Бронь подтверждена",
    );

    // Бронь ушла в iiko на Стол B с местным временем кассы.
    await expect
      .poll(() => iiko.calls.find((c) => c.path === "/api/1/reserve/create"), {
        timeout: 15_000,
      })
      .toBeTruthy();
    const created = iiko.calls.find((c) => c.path === "/api/1/reserve/create")!;
    expect(created.body).toMatchObject({
      organizationId: ORG,
      terminalGroupId: TG,
      tableIds: [T2],
      estimatedStartTime: `${TOMORROW} 12:00:00.000`,
      durationInMinutes: 60,
      phone: "+77071112233",
      customer: { type: "regular", name: "Гость iiko" },
    });
    const { data: booking } = await admin
      .from("bookings")
      .select("id, iiko_status")
      .eq("venue_id", venue!.id)
      .single();
    expect(booking!.iiko_status).toBe("sent");

    // Отмена брони — reserve/cancel в iiko (через фоновую отправку).
    await admin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Тест",
      })
      .eq("id", booking!.id);
    const res = await page.request.post("/api/cron/dispatch", {
      headers: { Authorization: "Bearer e2e-cron-secret" },
    });
    expect(res.status()).toBe(200);
    const cancel = iiko.calls.find((c) => c.path === "/api/1/reserve/cancel");
    expect(cancel?.body).toMatchObject({
      organizationId: ORG,
      reserveId: booking!.id,
      cancelReason: "Other",
    });
  } finally {
    await iiko.stop();
  }
});
