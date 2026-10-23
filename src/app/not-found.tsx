import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("Common");
  return (
    <main className="mx-auto grid w-full max-w-md flex-1 content-center justify-items-center gap-3 px-4 py-16 text-center">
      <p className="text-primary text-5xl font-bold">404</p>
      <h1 className="text-2xl font-bold">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFoundText")}</p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        {t("toHome")}
      </Link>
    </main>
  );
}
