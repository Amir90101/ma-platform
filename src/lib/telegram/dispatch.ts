import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { TelegramApi } from "./api";
import {
  type BookingPayload,
  formatNotification,
  type NotificationKind,
  type ShiftPayload,
} from "./format";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

// Один проход отправителя: подключить чаты по /start с кодом, затем
// разослать очередь уведомлений. Зовётся раз в минуту из pg_cron.
export async function dispatchTelegram({
  db,
  tg,
  t,
}: {
  db: SupabaseClient<Database>;
  tg: TelegramApi;
  t: Translate;
}) {
  const linked = await linkChats(db, tg, t);

  const { data: rows } = await db.rpc("telegram_claim_outbox", {
    p_limit: 50,
  });
  let sent = 0;
  for (const row of rows ?? []) {
    const { data: chats } = await db
      .from("telegram_chats")
      .select("chat_id")
      .eq("venue_id", row.venue_id);
    const text = formatNotification(
      row.kind as NotificationKind,
      row.payload as BookingPayload | ShiftPayload,
      t,
    );
    const results = await Promise.all(
      (chats ?? []).map((c) => tg.sendMessage(c.chat_id, text)),
    );
    // Хотя бы один чат получил — считаем отправленным; иначе повторим позже.
    if (results.length === 0 || results.some(Boolean)) {
      await db
        .from("notification_outbox")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent++;
    }
  }
  return { linked, sent };
}

async function linkChats(
  db: SupabaseClient<Database>,
  tg: TelegramApi,
  t: Translate,
) {
  const { data: state } = await db
    .from("telegram_state")
    .select("update_offset")
    .single();
  const updates = await tg.getUpdates(state?.update_offset ?? 0);
  let linked = 0;
  for (const u of updates) {
    const message = u.message;
    const text = message?.text?.trim() ?? "";
    // «/start КОД» из ссылки или «/start@бот КОД» в группе.
    const match = text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);
    if (!message || !match) continue;
    const code = match[1];
    if (!code) {
      await tg.sendMessage(message.chat.id, t("hello"));
      continue;
    }
    const { data: venue } = await db.rpc("telegram_link_chat", {
      p_code: code,
      p_chat_id: message.chat.id,
      p_title: message.chat.title ?? message.chat.first_name ?? "",
    });
    if (venue) linked++;
    await tg.sendMessage(
      message.chat.id,
      venue ? t("linked", { venue }) : t("linkFailed"),
    );
  }
  if (updates.length > 0) {
    await db
      .from("telegram_state")
      .update({ update_offset: updates[updates.length - 1].update_id + 1 })
      .eq("id", 1);
  }
  return linked;
}
