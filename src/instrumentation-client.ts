// Ошибки браузера — в Sentry. SDK грузится, только если задан DSN: без
// него гости на публичной странице не скачивают лишний код.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Promise.all([import("@sentry/nextjs"), import("@/lib/sentry-options")]).then(
    ([Sentry, { sentryOptions }]) => Sentry.init(sentryOptions(dsn)),
  );
}
