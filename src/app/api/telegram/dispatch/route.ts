import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTelegramApi, telegramConfigured } from "@/lib/telegram/api";
import { dispatchTelegram } from "@/lib/telegram/dispatch";

// Будит pg_cron раз в минуту (telegram_dispatch_ping) с секретом из Vault.
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_DISPATCH_SECRET ?? "";
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !secret ||
    !given ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!telegramConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" });
  }
  const t = await getTranslations({ locale: "ru", namespace: "Telegram" });
  const result = await dispatchTelegram({
    db: createAdminClient(),
    tg: createTelegramApi(),
    t: (key, values) => t(key as never, values as never),
  });
  return NextResponse.json({ ok: true, ...result });
}
