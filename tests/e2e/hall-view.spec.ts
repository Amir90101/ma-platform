import { expect, test } from "@playwright/test";
import { ADMIN, DEMO_VENUE_ID, login, OWNER } from "./helpers";

// Проверка 2.4: администратор видит карту и не может двигать фигуры.
test("администратор видит карту зала, но фигуры не двигаются", async ({
  page,
}) => {
  await page.goto("/login");
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL("/app");
  await page.getByRole("link", { name: /Демо Бильярд/ }).click();
  await page.getByRole("link", { name: "Карта зала" }).click();
  await expect(page).toHaveURL(`/app/${DEMO_VENUE_ID}/hall`);

  // 8 столов из seed, без кнопок редактора.
  await expect(
    page.getByTestId("hall-resources").getByRole("button"),
  ).toHaveCount(8);
  await expect(
    page.getByRole("button", { name: "Сохранить карту" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Открыть редактор" }),
  ).toHaveCount(0);

  // Стол 1 стоит в (100, 120) размером 180×100. Схема обрезана по фигурам
  // с отступом 30: x 70–1170 (вход до 1140), y от 90.
  const canvas = page.getByTestId("hall-canvas");
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas.locator("canvas").first()).toBeVisible();
  const tableCenter = async () => {
    const box = (await canvas.boundingBox())!;
    const scale = box.width / 1100;
    return {
      x: box.x + 120 * scale,
      y: box.y + 80 * scale,
      scale,
    };
  };

  // Выбираем стол. На телефоне страница прокручивается к панели стола —
  // возвращаем холст в кадр и меряем заново.
  let center = await tableCenter();
  await page.mouse.click(center.x, center.y);
  await expect(page.getByTestId("resource-panel")).toContainText("Стол 1");
  await page.waitForTimeout(800);
  await canvas.scrollIntoViewIfNeeded();
  center = await tableCenter();
  const { scale } = center;

  // Снимаем холст, тянем и сравниваем: картинка та же.
  const before = await canvas.screenshot();
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 200 * scale, center.y + 200 * scale, {
    steps: 10,
  });
  await page.mouse.up();
  const after = await canvas.screenshot();
  expect(after.equals(before)).toBe(true);
});

test("владелец переходит из просмотра в редактор", async ({ page }) => {
  await page.goto("/login");
  await login(page, OWNER.email, OWNER.password);
  await expect(page).toHaveURL("/app");
  await page.goto(`/app/${DEMO_VENUE_ID}/hall`);
  await page.getByRole("link", { name: "Открыть редактор" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/app/${DEMO_VENUE_ID}/settings/hall\\?hall=`),
  );
  await expect(
    page.getByRole("button", { name: "Сохранить карту" }),
  ).toBeVisible();
});
