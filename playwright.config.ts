import { defineConfig, devices } from "@playwright/test";

// Нужен запущенный `supabase start`.
export default defineConfig({
  // Dev-сервер под параллельными тестами отвечает на Server Action до пары
  // секунд вместе с перерисовкой страницы; 5 секунд по умолчанию впритык.
  expect: { timeout: 10_000 },
  testDir: "tests/e2e",
  fullyParallel: true,
  // Локальный dev-сервер компилирует и рендерит медленнее сборки: при
  // множестве воркеров действия ждут перерисовку больше 10 секунд.
  workers: process.env.CI || process.env.E2E_BASE_URL ? undefined : 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    // E2E_BASE_URL — прогон против уже запущенной сборки, например `next start -p 3100`.
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: process.env.CI
          ? "npm run build && npm run start"
          : "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
