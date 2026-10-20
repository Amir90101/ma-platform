import { expect, type Page, test } from "@playwright/test";
import { seedWorkVenue } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

function resourceButton(page: Page, name: string) {
  return page
    .getByTestId("hall-resources")
    .getByRole("button", { name: new RegExp(`^${name}\\b`) });
}

// Два окна рабочего экрана одного заведения с подключённым Realtime.
async function twoWindows(page: Page) {
  const email = uniqueEmail("realtime");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedWorkVenue(email);
  const second = await page.context().newPage();
  for (const p of [page, second]) {
    await p.goto(`/app/${venue.venueId}/hall`);
    await expect(p.getByTestId("resource-panel")).toHaveAttribute(
      "data-realtime",
      "on",
    );
  }
  return second;
}

// Проверка 4.6: два окна, запуск стола в одном — второе меняет статус без
// перезагрузки; смена тоже.
test("статус стола и смена приходят во второе окно без перезагрузки", async ({
  page,
}) => {
  const second = await twoWindows(page);

  await resourceButton(page, "Стол 1").click();
  await page
    .getByTestId("resource-panel")
    .getByRole("button", { name: "Старт" })
    .click();
  await expect(resourceButton(second, "Стол 1")).toHaveAttribute(
    "data-state",
    "busy",
  );

  await page
    .getByTestId("shift-bar")
    .getByLabel("Наличные в кассе, ₸")
    .fill("5000");
  await page
    .getByTestId("shift-bar")
    .getByRole("button", { name: "Открыть смену" })
    .click();
  await expect(second.getByTestId("shift-bar")).toContainText(
    "В кассе на начало: 5000 ₸",
  );

  await resourceButton(second, "Стол 1").click();
  await second
    .getByTestId("resource-panel")
    .getByRole("button", { name: "Пауза" })
    .click();
  await expect(resourceButton(page, "Стол 1")).toHaveAttribute(
    "data-state",
    "paused",
  );
});

// Запуск того же стола из двух окон одновременно: база пускает один сеанс,
// второе окно получает отказ.
test("одновременный запуск одного стола из двух окон: второе получает отказ", async ({
  page,
}) => {
  const second = await twoWindows(page);
  for (const p of [page, second]) await resourceButton(p, "Стол 2").click();

  await Promise.all(
    [page, second].map((p) =>
      p
        .getByTestId("resource-panel")
        .getByRole("button", { name: "Старт" })
        .click(),
    ),
  );

  for (const p of [page, second]) {
    await expect(resourceButton(p, "Стол 2")).toHaveAttribute(
      "data-state",
      "busy",
    );
  }
  const refusals = await Promise.all(
    [page, second].map((p) => p.getByTestId("work-error").count()),
  );
  expect([...refusals].sort()).toEqual([0, 1]);
  await expect(
    (refusals[0] ? page : second).getByTestId("work-error"),
  ).toHaveText("Стол уже занят. Обновите карту.");
});
