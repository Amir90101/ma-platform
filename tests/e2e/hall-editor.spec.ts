import { expect, type Page, test } from "@playwright/test";
import { ownerWithVenue } from "./helpers";

const HALL_WIDTH = 1200; // ширина зала по умолчанию в условных единицах

function items(page: Page) {
  return page.getByTestId("hall-items").getByRole("button");
}

async function select(page: Page, name: string) {
  await items(page).filter({ hasText: name }).click();
}

// Проверка 2.2: поставить 5 столов, подвинуть и повернуть, перезагрузить.
test("владелец расставляет столы, двигает и поворачивает, карта сохраняется", async ({
  page,
}) => {
  const venueId = await ownerWithVenue(page);
  await page.goto(`/app/${venueId}/settings/hall`);
  await page.getByRole("button", { name: "Создать зал" }).click();

  const addPool = page.getByRole("button", { name: "+ Стол пул" });
  for (let i = 0; i < 5; i++) await addPool.click();
  await expect(items(page)).toHaveCount(5);
  await expect(items(page).nth(4)).toContainText("Стол 5");

  // Поворот кнопкой.
  await select(page, "Стол 1");
  await page.getByRole("button", { name: "Повернуть на 90°" }).click();
  await expect(page.getByLabel("Поворот, °")).toHaveValue("90");

  // Перетаскивание мышью по холсту.
  await select(page, "Стол 2");
  const startX = Number(
    await page.getByLabel("X", { exact: true }).inputValue(),
  );
  const startY = Number(
    await page.getByLabel("Y", { exact: true }).inputValue(),
  );
  const canvas = page.getByTestId("hall-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const scale = box.width / HALL_WIDTH;
  const from = {
    x: box.x + (startX + 90) * scale,
    y: box.y + (startY + 50) * scale,
  };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 300 * scale, from.y + 400 * scale, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(page.getByLabel("X", { exact: true })).not.toHaveValue(
    String(startX),
  );
  const movedX = await page.getByLabel("X", { exact: true }).inputValue();
  const movedY = await page.getByLabel("Y", { exact: true }).inputValue();
  // Привязка к сетке 10.
  expect(Number(movedX) % 10).toBe(0);
  expect(Number(movedY) % 10).toBe(0);

  // Удаление и сохранение.
  await select(page, "Стол 5");
  await page.getByRole("button", { name: "Удалить" }).click();
  await expect(items(page)).toHaveCount(4);
  await page.getByRole("button", { name: "Сохранить карту" }).click();
  await expect(page.getByRole("status")).toHaveText("Карта сохранена");

  await page.reload();
  await expect(items(page)).toHaveCount(4);
  await select(page, "Стол 1");
  await expect(page.getByLabel("Поворот, °")).toHaveValue("90");
  await select(page, "Стол 2");
  await expect(page.getByLabel("X", { exact: true })).toHaveValue(movedX);
  await expect(page.getByLabel("Y", { exact: true })).toHaveValue(movedY);

  // Шаг «Карта зала» в настройках отмечен.
  await page.goto(`/app/${venueId}/settings`);
  await expect(
    page
      .getByTestId("venue-steps")
      .getByRole("listitem")
      .filter({ hasText: "Карта зала" }),
  ).toContainText("готово");
});
