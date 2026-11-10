import "server-only";
import { requireEnv } from "./env";

export type InlineButton = { text: string; callback_data?: string; url?: string };
export type InlineKeyboard = InlineButton[][];

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
  /** Ошибки, при которых повтор бессмыслен (бот заблокирован, неверный чат и т. п.). */
  get permanent(): boolean {
    return this.code === 400 || this.code === 403;
  }
}

export async function tg<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  // TELEGRAM_API_BASE — для прокси или локального Bot API сервера; по умолчанию официальный адрес.
  const base = (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, "");
  const res = await fetch(`${base}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok: true; result: T }
    | { ok: false; error_code: number; description: string; parameters?: { retry_after?: number } }
    | null;
  if (!data) throw new TelegramError(`Telegram ${method}: HTTP ${res.status}`, res.status);
  if (!data.ok) {
    // Токен в текст ошибки не попадает: в описании Telegram его нет, URL мы не логируем.
    throw new TelegramError(`Telegram ${method}: ${data.description}`, data.error_code, data.parameters?.retry_after);
  }
  return data.result;
}

export type SentMessage = { message_id: number; chat: { id: number } };

export function sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard, extra: Record<string, unknown> = {}) {
  return tg<SentMessage>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    ...extra,
  });
}

export async function editMessage(chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard) {
  try {
    await tg("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: keyboard ?? [] },
    });
  } catch (err) {
    // «message is not modified» — не ошибка: сообщение уже в актуальном виде.
    if (err instanceof TelegramError && /not modified/i.test(err.message)) return;
    throw err;
  }
}

export function answerCallback(id: string, text?: string, alert = false): Promise<void> {
  return tg("answerCallbackQuery", { callback_query_id: id, text, show_alert: alert }).then(
    () => undefined,
    () => undefined,
  );
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
