import "server-only";

// Bot API Telegram. TELEGRAM_API_BASE подменяют тесты фиктивным сервером.
export type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    chat: { id: number; title?: string; first_name?: string; type: string };
  };
};

export type TelegramApi = {
  getUpdates(offset: number): Promise<TelegramUpdate[]>;
  sendMessage(chatId: number, html: string): Promise<boolean>;
};

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function botUsername() {
  return process.env.TELEGRAM_BOT_USERNAME || null;
}

export function createTelegramApi(): TelegramApi {
  const base = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
  const url = (method: string) =>
    `${base}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;
  // Сеть и ответы Telegram ненадёжны: ошибка — это просто «не вышло»,
  // уведомление останется в очереди и уйдёт в следующий проход.
  const call = async (method: string, body: object) => {
    try {
      const res = await fetch(url(method), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      return (await res.json()) as { ok: boolean; result?: unknown };
    } catch {
      return { ok: false };
    }
  };
  return {
    async getUpdates(offset) {
      const r = await call("getUpdates", {
        offset,
        timeout: 0,
        allowed_updates: ["message"],
      });
      return r.ok ? (r.result as TelegramUpdate[]) : [];
    },
    async sendMessage(chatId, html) {
      const r = await call("sendMessage", {
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
      return r.ok;
    },
  };
}
