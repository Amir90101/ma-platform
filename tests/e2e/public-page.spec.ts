import { expect, test } from "@playwright/test";

// Проверка 6.2: страница заведения открывается на телефоне, превью ссылки
// показывает название и фото.
test("публичная страница демо-бильярдной", async ({ page }) => {
  await page.goto("/demo-billiards");

  await expect(
    page.getByRole("heading", { level: 1, name: "Демо Бильярд" }),
  ).toBeVisible();
  await expect(page.getByText("Алматы, пр. Абая, 1")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Открыть в 2ГИС" }),
  ).toHaveAttribute("href", /^https:\/\/2gis\.kz\/search\//);
  await expect(page.getByTestId("public-photos").getByRole("img")).toHaveCount(
    1,
  );
  await expect(page.getByTestId("public-hours")).toContainText("Пн");
  await expect(page.getByTestId("public-hours")).toContainText("10:00–02:00");
  await expect(page.getByTestId("public-prices")).toContainText("Будни день");
  await expect(page.getByTestId("public-prices")).toContainText("1500 ₸/ч");
  await expect(page.getByTestId("public-rules")).toContainText(
    "Бронь держится 15 мин после начала",
  );

  // Превью ссылки в WhatsApp и Instagram.
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Демо Бильярд",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /venue-photos\/aaaaaaaa-1111-0000-0000-000000000001\/demo-1\.jpg$/,
  );

  // Без горизонтальной прокрутки страницы на телефоне.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Данных гостей на странице нет: только публичные поля.
  await expect(page.locator("body")).not.toContainText("@demo.local");
});

test("неопубликованное и несуществующее заведение не открываются", async ({
  page,
}) => {
  for (const slug of ["demo-ps-club", "no-such-venue"]) {
    await page.goto(`/${slug}`);
    await expect(
      page.getByRole("heading", { name: "Заведение не найдено" }),
    ).toBeVisible();
  }
});
