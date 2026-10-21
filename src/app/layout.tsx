import type { Metadata } from "next";
import { Fira_Code, Fira_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { defaultLocale } from "@/i18n/request";
import "./globals.css";

// Fira Sans — шрифт для панелей и данных (рекомендация дизайн-системы):
// кириллица с казахскими буквами, табличные цифры для таймеров и сумм.
const sans = Fira_Sans({
  variable: "--font-sans-family",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
});

const mono = Fira_Code({
  variable: "--font-mono-family",
  subsets: ["latin", "cyrillic"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Common");
  return { title: t("productName") };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={defaultLocale}
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
