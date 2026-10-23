import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { dispatchIiko } from "@/lib/iiko/venue";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTelegramApi, telegramConfigured } from "@/lib/telegram/api";
import { dispatchTelegram } from "@/lib/telegram/dispatch";

// Фоновые отправки: будит pg_cron раз в минуту (cron_dispatch_ping) с
// секретом из Vault: Telegram и брони в iiko.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !secret ||
    !given ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const db = createAdminClient();
  let telegram = null;
  if (telegramConfigured()) {
    const t = await getTranslations({ locale: "ru", namespace: "Telegram" });
    telegram = await dispatchTelegram({
      db,
      tg: createTelegramApi(),
      t: (key, values) => t(key as never, values as never),
    });
  }
  const iiko = await dispatchIiko(db);
  return NextResponse.json({ ok: true, telegram, iiko });
}
