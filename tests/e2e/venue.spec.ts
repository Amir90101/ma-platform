import { expect, test } from "@playwright/test";
import { registerOwner, uniqueEmail, uniqueSuffix } from "./helpers";

// PNG 1×1 для загрузки фото.
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// Сценарий 1 из docs/USER_FLOWS.md: регистрация и первое заведение.
test("владелец создаёт организацию и заведение, загружает фото, правит профиль", async ({
  page,
}) => {
  await registerOwner(page, uniqueEmail("venue"));
  await expect(page).toHaveURL("/app");
  await page.getByRole("link", { name: "Создать заведение" }).click();
  await expect(page).toHaveURL("/app/new");

  // Пустая форма: ошибки по обязательным полям.
  await page.getByRole("button", { name: "Создать заведение" }).click();
  await expect(page.getByText("Введите название организации")).toBeVisible();
  await expect(page.getByText("Выберите тип заведения")).toBeVisible();

  await page.getByLabel("Название организации").fill("ТОО Пирамида");
  await page.getByLabel("Тип заведения").selectOption({ label: "Бильярд" });
  await page.getByLabel("Название", { exact: true }).fill("Бильярд Пирамида");
  // slug предлагается из названия латиницей.
  await expect(page.getByLabel("Адрес страницы")).toHaveValue(
    "bilyard-piramida",
  );
  await page.getByLabel("Город").fill("Алматы");
  await page.getByLabel("Вс, Открытие").fill("12:00");
  await page.getByLabel("Вс, Закрытие").fill("03:00");
  await page
    .getByRole("group", { name: "Часы работы" })
    .getByLabel("Выходной")
    .first()
    .check();

  // Зарезервированный и занятый slug не принимаются.
  await page.getByLabel("Адрес страницы").fill("admin");
  await page.getByRole("button", { name: "Создать заведение" }).click();
  await expect(page.getByText("Этот адрес занят системой")).toBeVisible();

  await page.getByLabel("Адрес страницы").fill("demo-billiards");
  await page.getByRole("button", { name: "Создать заведение" }).click();
  await expect(page.getByText("уже занят другим заведением")).toBeVisible();

  const slug = `piramida-${uniqueSuffix()}`;
  await page.getByLabel("Адрес страницы").fill(slug);
  await page.getByRole("button", { name: "Создать заведение" }).click();

  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}\/settings$/);
  await expect(
    page.getByRole("heading", { name: "Бильярд Пирамида" }),
  ).toBeVisible();
  const steps = page.getByTestId("venue-steps");
  await expect(steps).toContainText("Карта зала");
  await expect(
    steps.getByRole("listitem").filter({ hasText: "Фото" }),
  ).toContainText("не заполнено");

  // Фото: загрузка и проверка после перезагрузки.
  await page.locator('input[type="file"]').setInputFiles({
    name: "hall.png",
    mimeType: "image/png",
    buffer: PIXEL_PNG,
  });
  await expect(page.getByTestId("venue-photo")).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("venue-photo")).toHaveCount(1);
  await expect(
    steps.getByRole("listitem").filter({ hasText: "Фото" }),
  ).toContainText("готово");

  // Профиль сохранился с часами работы; правка сохраняется.
  await expect(page.getByLabel("Адрес страницы")).toHaveValue(slug);
  await expect(page.getByLabel("Вс, Открытие")).toHaveValue("12:00");
  await expect(page.getByLabel("Пн, Открытие")).toBeDisabled();
  await page.getByLabel("Город").fill("Астана");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByRole("status")).toHaveText("Изменения сохранены");
  await page.reload();
  await expect(page.getByLabel("Город")).toHaveValue("Астана");

  // Фото удаляется.
  await page.getByRole("button", { name: "Удалить фото 1" }).click();
  await expect(page.getByTestId("venue-photo")).toHaveCount(0);

  // Заведение в списке на /app.
  await page.goto("/app");
  await expect(
    page.getByRole("link", { name: /Бильярд Пирамида/ }),
  ).toBeVisible();
});

test("файл не того типа не загружается", async ({ page }) => {
  await registerOwner(page, uniqueEmail("photo"));
  await expect(page).toHaveURL("/app");
  await page.goto("/app/new");
  await page.getByLabel("Название организации").fill("ТОО Фото");
  await page.getByLabel("Тип заведения").selectOption({ label: "Караоке" });
  await page.getByLabel("Название", { exact: true }).fill("Караоке");
  await page.getByLabel("Адрес страницы").fill(`karaoke-${uniqueSuffix()}`);
  await page.getByLabel("Город").fill("Шымкент");
  await page.getByRole("button", { name: "Создать заведение" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.locator('input[type="file"]').setInputFiles({
    name: "doc.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4"),
  });
  await expect(page.getByText("Можно только JPEG, PNG или WebP")).toBeVisible();
  await expect(page.getByTestId("venue-photo")).toHaveCount(0);
});
