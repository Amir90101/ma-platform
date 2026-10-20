import { getRequestConfig } from "next-intl/server";

// Пока один язык. Казахский добавим выбором локали, без переделки компонентов.
export const defaultLocale = "ru";

export default getRequestConfig(async () => {
  const locale = defaultLocale;
  return {
    locale,
    timeZone: "Asia/Almaty",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
