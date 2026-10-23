import Link from "next/link";
import {
  BellRing,
  CalendarCheck,
  ChartColumn,
  Map,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/app-shell/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FEATURES = [
  { key: "hall", icon: Map },
  { key: "timer", icon: Timer },
  { key: "booking", icon: CalendarCheck },
  { key: "alerts", icon: BellRing },
  { key: "reports", icon: ChartColumn },
  { key: "control", icon: ShieldCheck },
] as const;

// Схематичный зал для первого экрана: несколько столов в разных статусах.
const DEMO_TABLES = [
  { key: "ps1", state: "busy", caption: "1:24:05" },
  { key: "ps2", state: "free", caption: "" },
  { key: "table", state: "booked", caption: "booked" },
  { key: "karaoke", state: "paused", caption: "0:47:12" },
  { key: "vip", state: "free", caption: "" },
  { key: "court", state: "busy", caption: "2:10:31" },
] as const;

const TONE = {
  free: "bg-status-free-soft border-status-free/50 text-status-free",
  busy: "bg-status-busy-soft border-status-busy/50 text-status-busy",
  paused: "bg-status-paused-soft border-status-paused/60 text-status-paused",
  booked: "bg-status-booked-soft border-status-booked/50 text-status-booked",
} as const;

export default async function Home() {
  const t = await getTranslations("Home");
  const tCommon = await getTranslations("Common");
  return (
    <div className="flex flex-1 flex-col">
      <header className="dark bg-background text-foreground">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <Logo name={tCommon("productName")} />
          <nav className="flex items-center gap-2">
            <Link href="/login" className={buttonVariants()}>
              {t("start")}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div className="dark bg-background text-foreground">
          <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 lg:grid-cols-2 lg:py-20">
            <div className="grid gap-6">
              <p className="text-primary text-sm font-semibold">
                {t("eyebrow")}
              </p>
              <h1 className="text-4xl leading-tight font-bold sm:text-5xl">
                {t("title")}
              </h1>
              <p className="text-muted-foreground max-w-xl text-lg">
                {t("subtitle")}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/login" className={buttonVariants({ size: "lg" })}>
                  {t("start")}
                </Link>
                <Link
                  href="/demo-billiards"
                  className={buttonVariants({ size: "lg", variant: "outline" })}
                >
                  {t("demo")}
                </Link>
              </div>
              <p className="text-muted-foreground text-sm">{t("noPayment")}</p>
            </div>

            {/* Иллюстрация: как выглядит карта зала. */}
            <div
              aria-hidden="true"
              className="bg-card ring-border rounded-3xl p-3 shadow-2xl ring-1 sm:p-4"
            >
              <div className="bg-background grid gap-4 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{t("mockTitle")}</span>
                  <span className="text-muted-foreground">
                    {t("mockShift")}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {DEMO_TABLES.map((table) => (
                    <div
                      key={table.key}
                      className={cn(
                        "grid aspect-[4/3] content-center justify-items-center gap-1 rounded-xl border-2 p-2 text-center",
                        TONE[table.state],
                      )}
                    >
                      <span className="text-foreground text-sm font-semibold">
                        {t(`mockPlaces.${table.key}`)}
                      </span>
                      <span className="text-xs font-medium tabular-nums">
                        {table.caption === "booked"
                          ? t("mockBooked")
                          : table.caption || t("mockFree")}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="bg-card flex items-center justify-between rounded-xl p-3 text-sm">
                  <span>
                    <span className="block font-semibold">
                      {t("mockPanel")}
                    </span>
                    <span className="text-muted-foreground">
                      {t("mockPanelHint")}
                    </span>
                  </span>
                  <span className="text-xl font-semibold tabular-nums">
                    {t("mockAmount")}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="bg-card">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14">
            <div className="grid max-w-2xl gap-2">
              <h2 className="text-3xl font-bold">{t("featuresTitle")}</h2>
              <p className="text-muted-foreground">{t("featuresHint")}</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ key, icon: Icon }) => (
                <li
                  key={key}
                  className="bg-background grid content-start gap-3 rounded-2xl p-5"
                >
                  <span className="bg-secondary text-primary grid size-11 place-items-center rounded-xl">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="font-semibold">
                    {t(`features.${key}.title`)}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {t(`features.${key}.text`)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14">
          <h2 className="text-3xl font-bold">{t("stepsTitle")}</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {(["one", "two", "three"] as const).map((step, i) => (
              <li key={step} className="grid content-start gap-2">
                <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-full font-semibold">
                  {i + 1}
                </span>
                <h3 className="font-semibold">{t(`steps.${step}.title`)}</h3>
                <p className="text-muted-foreground text-sm">
                  {t(`steps.${step}.text`)}
                </p>
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground text-sm">{t("types")}</p>
        </section>

        <section className="px-4 pb-16">
          <div className="bg-sidebar mx-auto grid w-full max-w-6xl justify-items-start gap-4 rounded-3xl p-8 text-white sm:p-12">
            <h2 className="max-w-xl text-3xl font-bold">{t("ctaTitle")}</h2>
            <p className="max-w-xl text-white/70">{t("ctaText")}</p>
            <Link href="/login" className={buttonVariants({ size: "lg" })}>
              {t("start")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="text-muted-foreground border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm">
          <span>{tCommon("productName")}</span>
          <span>{t("footer")}</span>
        </div>
      </footer>
    </div>
  );
}
