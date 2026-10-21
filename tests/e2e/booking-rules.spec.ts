import { expect, test } from "@playwright/test";
import { admin, seedWorkVenue } from "./fixtures";
import { registerOwner, uniqueEmail } from "./helpers";

// Сценарий 4 и публикация: владелец задаёт правила брони и публикует страницу.
test("владелец меняет правила брони и публикует страницу", async ({ page }) => {
  const email = uniqueEmail("rules");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedWorkVenue(email);
  const { data } = await admin
    .from("venues")
    .select("slug")
    .eq("id", venue.venueId)
    .single();
  const slug = data!.slug;

  await page.goto(`/app/${venue.venueId}/settings/booking`);
  const form = page.getByTestId("booking-rules-form");
  await form.getByLabel("Минимальная бронь, мин").fill("45");
  await form.getByRole("button", { name: "Сохранить правила" }).click();
  await expect(form).toContainText(
    "Минимальная бронь должна делиться на шаг времени",
  );

  await form.getByLabel("Минимальная бронь, мин").fill("90");
  await form.getByLabel("Пауза между бронями, мин").fill("15");
  await form.getByLabel("Неявка через, мин").fill("20");
  await form.getByRole("button", { name: "Сохранить правила" }).click();
  await expect(page.getByTestId("rules-saved")).toHaveText("Правила сохранены");
  const { data: saved } = await admin
    .from("venues")
    .select("min_duration_min, buffer_min, no_show_after_min")
    .eq("id", venue.venueId)
    .single();
  expect(saved).toEqual({
    min_duration_min: 90,
    buffer_min: 15,
    no_show_after_min: 20,
  });

  // До публикации страницы нет.
  const control = page.getByTestId("publish-control");
  await expect(control).toContainText("Страница скрыта");
  await control.getByRole("button", { name: "Опубликовать" }).click();
  await expect(control).toContainText("Страница опубликована:");
  await expect(control.getByRole("link")).toHaveAttribute(
    "href",
    new RegExp(`/${slug}$`),
  );

  const guest = await page.context().newPage();
  await guest.goto(`/${slug}`);
  await expect(guest.getByTestId("public-rules")).toContainText(
    "Бронь держится 20 мин после начала",
  );
  await expect(guest.getByTestId("public-rules")).toContainText(
    "Минимальная бронь — 90 мин.",
  );

  await control.getByRole("button", { name: "Снять с публикации" }).click();
  await expect(control).toContainText("Страница скрыта");
  await guest.reload();
  await expect(
    guest.getByRole("heading", { name: "Заведение не найдено" }),
  ).toBeVisible();
});

test("без мест на карте страницу не опубликовать", async ({ page }) => {
  const email = uniqueEmail("empty");
  await registerOwner(page, email);
  await page.waitForURL("/app");
  const venue = await seedWorkVenue(email, 1);
  await admin
    .from("resources")
    .update({ is_active: false })
    .eq("venue_id", venue.venueId);

  await page.goto(`/app/${venue.venueId}/settings/booking`);
  const control = page.getByTestId("publish-control");
  await control.getByRole("button", { name: "Опубликовать" }).click();
  await expect(control).toContainText("Сначала добавьте места на карту зала");
  await expect(control).toContainText("Страница скрыта");
});
