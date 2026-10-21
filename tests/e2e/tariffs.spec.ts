import { expect, type Locator, type Page, test } from "@playwright/test";
import { ownerWithVenue } from "./helpers";

// Блок «Новая цена за час» / «Новый тариф на время», раскрытый.
async function openNew(page: Page, title: string): Promise<Locator> {
  const block = page.locator("details", {
    has: page.locator("summary", { hasText: title }),
  });
  if ((await block.getAttribute("open")) === null) {
    await block.locator("summary").click();
  }
  return block;
}

async function addTariff(
  page: Page,
  t: { name: string; price: string; from: string; to: string; days?: string[] },
) {
  const form = await openNew(page, "Новая цена за час");
  await form.getByLabel("Название").fill(t.name);
  await form.getByLabel("Цена за час, ₸").fill(t.price);
  if (t.days) {
    for (const day of ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]) {
      await form
        .getByLabel(day, { exact: true })
        .setChecked(t.days.includes(day));
    }
  }
  await form.getByLabel("С", { exact: true }).fill(t.from);
  await form.getByLabel("До", { exact: true }).fill(t.to);
  await form.getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByTestId("tariff-list")).toContainText(t.name);
  // React очищает форму после действия чуть позже, чем обновляется список:
  // ждём сброса, иначе следующий тариф начнут вводить в старую форму.
  await expect(form.getByLabel("Название")).toHaveValue("");
}

const gaps = (page: Page) => page.getByTestId("grid-gaps").first();

// Сценарий 3 из docs/USER_FLOWS.md.
test("владелец задаёт тарифы с ночным, видит часы без тарифа и создаёт пакет", async ({
  page,
}) => {
  // Новое заведение работает 10:00–22:00 каждый день.
  const venueId = await ownerWithVenue(page);
  await page.goto(`/app/${venueId}/settings/tariffs`);
  await expect(gaps(page)).toHaveText("Часов без тарифа: 84");

  // Ошибки формы.
  const form = await openNew(page, "Новая цена за час");
  await form.getByLabel("Название").fill("Пусто");
  await form.getByRole("button", { name: "Добавить" }).click();
  await expect(form.getByText("Целое число тенге")).toBeVisible();

  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт"];
  await addTariff(page, {
    name: "День",
    price: "1500",
    from: "10:00",
    to: "18:00",
    days: weekdays,
  });
  await addTariff(page, {
    name: "Вечер",
    price: "2500",
    from: "18:00",
    to: "22:00",
    days: weekdays,
  });
  // Ночной тариф вводится как есть.
  await addTariff(page, {
    name: "Ночь",
    price: "2000",
    from: "22:00",
    to: "06:00",
  });
  await expect(
    page
      .getByTestId("tariff-list")
      .getByRole("listitem")
      .filter({ hasText: "Ночь" }),
  ).toContainText("22:00–06:00 (через полночь)");
  await expect(gaps(page)).toHaveText("Часов без тарифа: 24");

  await addTariff(page, {
    name: "Выходные",
    price: "3000",
    from: "10:00",
    to: "22:00",
    days: ["Сб", "Вс"],
  });
  await expect(gaps(page)).toHaveText("Все рабочие часы покрыты тарифами.");

  // Пакет.
  const pkg = await openNew(page, "Новый тариф на время");
  await pkg.getByLabel("Название").fill("3 часа за 5 000");
  await pkg.getByLabel("Минут игры").fill("180");
  await pkg.getByLabel("Цена тарифа, ₸").fill("5000");
  await pkg.getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByTestId("package-list")).toContainText(
    "180 мин за 5000 ₸",
  );

  // Удаляем вечерний — будни 18:00–22:00 снова без тарифа.
  await page.getByRole("button", { name: "Удалить Вечер" }).click();
  await expect(page.getByTestId("tariff-list")).not.toContainText("Вечер");
  await expect(gaps(page)).toHaveText("Часов без тарифа: 20");
  await expect(
    page.getByTestId("week-grid").first().getByLabel("Пн 18:00: нет тарифа"),
  ).toHaveAttribute("data-state", "gap");

  // Правка тарифа: «День» до 20:00 закрывает часть дыры.
  const day = page
    .getByTestId("tariff-list")
    .getByRole("listitem")
    .filter({ hasText: "День" });
  await day.getByLabel("Изменить День").click();
  await day.getByLabel("До", { exact: true }).fill("20:00");
  await day.getByRole("button", { name: "Сохранить" }).click();
  await expect(gaps(page)).toHaveText("Часов без тарифа: 10");

  await page.goto(`/app/${venueId}/settings`);
  await expect(
    page
      .getByTestId("venue-steps")
      .getByRole("listitem")
      .filter({ hasText: "Тарифы" }),
  ).toContainText("готово");
});
