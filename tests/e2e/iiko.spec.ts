import http from "node:http";
import { expect, test } from "@playwright/test";
import { addDays, todayIn } from "../../src/lib/venue-time";
import { admin, seedPublicVenue } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

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

test("заведение с iiko: занятость из кассы, бронь и отмена уходят в iiko", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "один фиктивный iiko на порту 3998",
  );
  test.setTimeout(90_000);
  const iiko = fakeIiko();
  await iiko.start();
  try {
    const email = uniqueEmail("iiko");
    await registerOwner(page, email);
    await expect(page).toHaveURL("/app");
    const venue = await seedPublicVenue(email, 1);

    // Режим «только онлайн-бронь»: карты зала в меню нет.
    await page.goto(`/app/${venue.venueId}/settings/integration`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Только онлайн-бронь").check();
    await expect(
      page.getByRole("navigation", { name: "Разделы заведения" }).first(),
    ).not.toContainText("Карта зала");

    // Ключ, организация, касса, зал → столы загружены, обмен включён.
    const form = page.getByTestId("iiko-form");
    await form.getByLabel("Ключ API iiko").fill("e2e-api-login");
    await form.getByRole("button", { name: "Проверить и сохранить" }).click();
    await form.getByLabel("Организация").selectOption({ label: "Клуб iiko" });
    await form.getByLabel("Группа терминалов").selectOption({ label: "Касса" });
    await expect(form.getByText("Основной · столов: 2")).toBeVisible();
    await form
      .getByRole("button", { name: "Загрузить столы и включить обмен" })
      .click();
    await expect(page.getByTestId("iiko-status")).toContainText(
      "Обмен с iiko включён · столов: 2",
    );

    // Гость: завтра 12:00 Стол A занят в iiko, Стол B свободен.
    await page.context().clearCookies();
    await page.goto(`/${venue.slug}`);
    const picker = page.getByTestId("booking-picker");
    await picker.getByRole("button", { name: "Завтра", exact: true }).click();
    await page
      .getByTestId("time-slots")
      .getByRole("button")
      .filter({ hasText: /^12:00/ })
      .click();
    await picker.getByRole("button", { name: "Выбрать место" }).click();
    const seat = (name: string) =>
      page.getByTestId("seat-list").getByRole("button", { name, exact: true });
    await expect(seat("Стол A")).toBeDisabled();
    await seat("Стол B").click();
    await picker.getByRole("button", { name: "Далее" }).click();

    const guest = page.getByTestId("guest-form");
    await guest.getByLabel("Имя", { exact: true }).fill("Гость iiko");
    await guest.getByLabel("Телефон", { exact: true }).fill("+7 707 111 22 33");
    await guest.getByLabel("Согласен на обработку").check();
    const submit = guest.getByRole("button", { name: "Забронировать" });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();
    await expect(page.getByTestId("booking-done")).toContainText(
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
      .eq("venue_id", venue.venueId)
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
