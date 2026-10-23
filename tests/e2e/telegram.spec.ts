import http from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { admin, seedWorkVenue } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

// Фиктивный Bot API на адресе из TELEGRAM_API_BASE (.env.local, CI).
const PORT = 3999;
const SECRET = "e2e-cron-secret";

type Sent = { chat_id: number; text: string };

function fakeTelegram() {
  const sent: Sent[] = [];
  let updates: object[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url?.endsWith("/getUpdates")) {
        res.end(JSON.stringify({ ok: true, result: updates }));
        updates = [];
      } else if (req.url?.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body));
        res.end(JSON.stringify({ ok: true, result: {} }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false }));
      }
    });
  });
  return {
    sent,
    push: (u: object) => updates.push(u),
    start: () =>
      new Promise<void>((r) => server.listen(PORT, "127.0.0.1", () => r())),
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}

// То, что раз в минуту делает pg_cron.
async function dispatch(page: Page) {
  const res = await page.request.post("/api/cron/dispatch", {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  expect(res.status()).toBe(200);
  return res.json();
}

test("владелец подключает чат, бот присылает новую бронь", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "один фиктивный Bot API на порту 3999",
  );
  const tg = fakeTelegram();
  await tg.start();
  try {
    const email = uniqueEmail("telegram");
    await registerOwner(page, email);
    await expect(page).toHaveURL("/app");
    const venue = await seedWorkVenue(email, 1);

    // Без секрета отправитель не запускается.
    const anon = await page.request.post("/api/cron/dispatch");
    expect(anon.status()).toBe(401);

    await page.goto(`/app/${venue.venueId}/settings/notifications`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Получить ссылку" }).click();
    const link = page.getByTestId("telegram-link");
    await expect(link).toHaveAttribute(
      "href",
      /^https:\/\/t\.me\/e2e_test_bot\?start=[0-9A-F]{10}$/,
    );
    const code = (await link.getAttribute("href"))!.split("=")[1];
    await expect(page.getByTestId("telegram-command")).toHaveText(
      `/start@e2e_test_bot ${code}`,
    );

    // Группа присылает /start с кодом — бот подключает чат и отвечает.
    const chatId = -Math.floor(Math.random() * 1e12);
    tg.push({
      update_id: Date.now(),
      message: {
        text: `/start@e2e_test_bot ${code}`,
        chat: { id: chatId, title: "Админы клуба", type: "group" },
      },
    });
    await dispatch(page);
    const toChat = () => tg.sent.filter((m) => m.chat_id === chatId);
    expect(toChat()[0].text).toContain("Готово: этот чат получает уведомления");
    await page.reload();
    await expect(page.getByTestId("telegram-chats")).toContainText(
      "Админы клуба",
    );

    // Новая бронь по звонку — сообщение в чат.
    const { data: customer } = await admin
      .from("customers")
      .insert({ venue_id: venue.venueId, phone: "+77015550011", name: "Ержан" })
      .select("id")
      .single();
    const start = new Date(Date.now() + 2 * 86_400_000);
    await admin.from("bookings").insert({
      venue_id: venue.venueId,
      resource_id: venue.tables[0].id,
      customer_id: customer!.id,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 3_600_000).toISOString(),
      blocked_until: new Date(start.getTime() + 3_600_000).toISOString(),
      source: "phone",
    });
    await dispatch(page);
    const booking = toChat().at(-1)!.text;
    expect(booking).toContain("<b>Новая бронь</b> · Клуб e2e");
    expect(booking).toContain("Ержан, +77015550011");
    expect(booking).toContain("По звонку");

    // Отключили — новые события не копятся и не уходят.
    await page.getByRole("button", { name: "Отключить Админы клуба" }).click();
    await expect(page.getByTestId("telegram-chats")).toHaveCount(0);
    const before = toChat().length;
    await admin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Тест",
      })
      .eq("customer_id", customer!.id);
    await dispatch(page);
    expect(toChat().length).toBe(before);
  } finally {
    await tg.stop();
  }
});
