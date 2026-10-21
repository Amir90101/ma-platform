import { connection } from "next/server";

// Проверка мониторинга на сервере (этап 8.2): с SENTRY_CHECK_ENABLED=1
// бросает ошибку с телефоном в тексте. В Sentry она должна прийти, а
// телефон — замаскированным. В остальное время адреса нет.
export async function GET() {
  // Переменная окружения читается при запросе, а не при сборке.
  await connection();
  if (process.env.SENTRY_CHECK_ENABLED !== "1") {
    return new Response("Not found", { status: 404 });
  }
  throw new Error("Проверка Sentry: гость +7 700 123 45 67");
}
