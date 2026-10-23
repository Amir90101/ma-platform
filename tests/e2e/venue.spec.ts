import { expect, test } from "@playwright/test";
import { seedWorkVenue } from "./fixtures";
import {
  lastEmailText,
  login,
  PLATFORM,
  registerOwner,
  uniqueEmail,
  uniqueSuffix,
} from "./helpers";

// PNG 1×1 для загрузки фото.
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// Сценарий 1 из docs/USER_FLOWS.md: владелец платформы подключает заведение,
// владелец заведения входит по приглашению и настраивает профиль.
test("владелец платформы подключает заведение, владелец входит по приглашению и правит профиль", async ({
  page,
}) => {
  const ownerEmail = uniqueEmail("venue-owner");
  await page.goto("/login");
  await login(page, PLATFORM.email, PLATFORM.password);
  // Своих заведений нет — сразу кабинет платформы.
  await expect(page).toHaveURL("/admin");
  await page.getByRole("link", { name: "Подключить заведение" }).click();
  await expect(page).toHaveURL("/admin/new");

  // Пустая форма: ошибки по обязательным полям.
  await page.getByRole("button", { name: "Создать заведение" }).click();
  await expect(page.getByText("Введите email владельца")).toBeVisible();
  await expect(page.getByText("Выберите тип заведения")).toBeVisible();

  await page.getByLabel("Email владельца заведения").fill(ownerEmail);
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

  // В списке платформы — заведение и владелец, денег нет.
  await expect(page).toHaveURL(`/admin?created=${slug}`);
  await expect(page.getByRole("status")).toContainText(`/${slug} подключено`);
  const card = page
    .getByTestId("platform-venue")
    .filter({ hasText: ownerEmail });
  await expect(card).toContainText("Бильярд Пирамида");
  await expect(card).toContainText("Не опубликовано");
  await expect(page.getByTestId("platform-venues")).not.toContainText("₸");
  await page.getByRole("button", { name: "Выйти" }).click();

  // Владелец задаёт пароль по ссылке из приглашения и видит заведение.
  const body = await lastEmailText(ownerEmail);
  const link = body.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
  expect(link, "ссылка в приглашении").toBeTruthy();
  await page.goto(link!);
  await expect(page).toHaveURL("/reset-password");
  await page.getByLabel(/Новый пароль/).fill("owner-password-1");
  await page.getByLabel("Повторите пароль").fill("owner-password-1");
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(page).toHaveURL("/app");
  await page.getByRole("link", { name: /Бильярд Пирамида/ }).click();
  await page.waitForURL(/\/app\/[0-9a-f-]{36}$/);
  await page.goto(`${page.url()}/settings`);
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

  // Круглосуточно без выходных: время не вводится, после сохранения отмечено.
  await page.getByLabel("Круглосуточно, без выходных").check();
  await expect(page.getByLabel("Пн, Открытие")).toBeDisabled();
  await expect(page.getByLabel("Вс, Круглосуточно")).toBeChecked();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByRole("status")).toHaveText("Изменения сохранены");
  await page.reload();
  await expect(page.getByLabel("Круглосуточно, без выходных")).toBeChecked();
  await expect(page.getByLabel("Пн, Круглосуточно")).toBeChecked();

  // Фото удаляется.
  await page.getByRole("button", { name: "Удалить фото 1" }).click();
  await expect(page.getByTestId("venue-photo")).toHaveCount(0);
});

test("владелец заведения не подключает заведения и не видит кабинет платформы", async ({
  page,
}) => {
  await registerOwner(page, uniqueEmail("no-venues"));
  await expect(page).toHaveURL("/app");
  await expect(
    page.getByText("Их подключает администратор платформы"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Подключить заведение" }),
  ).toHaveCount(0);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Страница не найдена" }),
  ).toBeVisible();
  await expect(page.getByTestId("platform-venues")).toHaveCount(0);
});

test("файл не того типа не загружается", async ({ page }) => {
  const email = uniqueEmail("photo");
  await registerOwner(page, email);
  await expect(page).toHaveURL("/app");
  const { venueId } = await seedWorkVenue(email, 1);
  await page.goto(`/app/${venueId}/settings`);
  // Обработчик выбора файла появляется после гидратации.
  await page.waitForLoadState("networkidle");

  await page.locator('input[type="file"]').setInputFiles({
    name: "doc.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4"),
  });
  await expect(page.getByText("Можно только JPEG, PNG или WebP")).toBeVisible();
  await expect(page.getByTestId("venue-photo")).toHaveCount(0);
});
