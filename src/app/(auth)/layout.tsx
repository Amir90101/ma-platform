import Link from "next/link";
import { CalendarCheck, ChartColumn, Map } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Logo, LogoMark } from "@/components/app-shell/logo";

// Вход, регистрация, сброс пароля: слева на компьютере — о продукте,
// справа — форма. На телефоне только логотип и форма.
export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const t = await getTranslations("Landing");
  const tCommon = await getTranslations("Common");
  const points = [
    { icon: Map, text: t("pointHall") },
    { icon: CalendarCheck, text: t("pointBooking") },
    { icon: ChartColumn, text: t("pointReports") },
  ];
  return (
    <div className="grid flex-1 lg:grid-cols-2">
      <aside className="bg-primary text-primary-foreground relative hidden overflow-hidden p-12 lg:flex lg:flex-col">
        <Link href="/" aria-label={tCommon("productName")}>
          <Logo
            name={tCommon("productName")}
            className="text-lg [&_rect:first-child]:fill-white/20"
          />
        </Link>
        <div className="my-auto grid max-w-md gap-8">
          <h2 className="text-4xl leading-tight font-semibold">
            {t("authTitle")}
          </h2>
          <ul className="grid gap-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/15">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* Декор: силуэт шара на сукне. */}
        <div
          aria-hidden="true"
          className="absolute -right-24 -bottom-24 size-96 rounded-full bg-white/10"
        />
      </aside>
      <main className="flex flex-col items-center justify-center px-4 py-10">
        <Link
          href="/"
          aria-label={tCommon("productName")}
          className="mb-8 flex items-center gap-2 font-semibold lg:hidden"
        >
          <LogoMark />
          {tCommon("productName")}
        </Link>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
