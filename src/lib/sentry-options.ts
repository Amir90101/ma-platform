import type { BrowserOptions } from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

// Общие настройки Sentry для сервера и браузера. Без DSN Sentry выключен.
// Данные гостей не отправляем. Sentry 11 по умолчанию собирает тела
// запросов, cookie, заголовки и локальные переменные — форма брони
// присылает телефон в теле, поэтому всё это выключено. Дополнительно
// телефоны и токены ссылок вычищаются из каждого события.
export function sentryOptions(dsn: string | undefined): BrowserOptions {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development",
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    tracesSampleRate: 0.1,
    beforeSend: (event) => scrubEvent(event),
    // Трассировки в Sentry 11 отправляются потоком спанов: их имена и
    // атрибуты содержат адреса (/b/{token}), чистим каждый спан.
    beforeSendSpan: (span) => scrubEvent(span),
    beforeBreadcrumb: (breadcrumb) => scrubEvent(breadcrumb),
  };
}
