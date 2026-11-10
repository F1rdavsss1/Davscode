import "server-only";
import { ownerId } from "./env";
import { sheetsConfigured } from "./google";
import { kvCleanup } from "./kv";
import { readLeads, saveNotifyState, type NotifyState } from "./leads";
import { sendMessage, TelegramError, escapeHtml } from "./telegram";
import { leadCardText, leadKeyboard } from "./bot/cards";

/*
 * Доставка уведомлений владельцу о новых заявках.
 * Состояние хранится в самой заявке (служебная колонка), поэтому заявка не теряется,
 * даже если Telegram недоступен: при следующем запуске уведомление будет повторено.
 */

const MAX_ATTEMPTS = 10;
const LOCK_SECONDS = 60;

/** Экспоненциальная задержка: 30 с, 1 мин, 2 мин … но не больше 6 часов. */
const backoffSeconds = (attempts: number) => Math.min(30 * 2 ** Math.max(0, attempts - 1), 6 * 3600);

const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();

export async function processJobs(opts: { limit?: number; leadIds?: string[] } = {}): Promise<{ done: number; failed: number }> {
  if (!sheetsConfigured()) return { done: 0, failed: 0 };
  const limit = opts.limit ?? 10;
  const now = Date.now();

  const due = (await readLeads())
    .filter(({ lead }) => {
      const n = lead.notify;
      if (!n || (n.status !== "pending" && n.status !== "running")) return false;
      if (opts.leadIds && !opts.leadIds.includes(lead.id)) return false;
      // running с истёкшей блокировкой — предыдущий вызов упал, повторяем.
      return Date.parse(n.next_at) <= now;
    })
    .slice(0, limit);

  let done = 0;
  let failed = 0;
  for (const ref of due) {
    const attempts = (ref.lead.notify.attempts ?? 0) + 1;
    // Помечаем заявку как «в работе», чтобы параллельный вызов не отправил уведомление дважды.
    const running: NotifyState = { ...ref.lead.notify, status: "running", attempts, next_at: inSeconds(LOCK_SECONDS) };
    await saveNotifyState(ref, running);
    ref.lead.notify = running;

    try {
      const owner = ownerId();
      if (!owner) throw new Error("TELEGRAM_OWNER_ID is not set");
      await sendMessage(owner, leadCardText(ref.lead), leadKeyboard(ref.lead));
      await saveNotifyState(ref, { status: "done", attempts, next_at: running.next_at, done_at: new Date().toISOString(), error: null });
      done++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message.slice(0, 300) : "unknown error";
      const permanent = err instanceof TelegramError && err.permanent;
      const exhausted = permanent || attempts >= MAX_ATTEMPTS;
      const delay = err instanceof TelegramError && err.retryAfter ? err.retryAfter : backoffSeconds(attempts);
      await saveNotifyState(ref, { status: exhausted ? "failed" : "pending", attempts, next_at: inSeconds(delay), error: message }).catch(
        (e) => console.error("[jobs] state save failed:", e instanceof Error ? e.message : e),
      );
      console.error(`[jobs] notify ${ref.lead.id} attempt ${attempts} failed: ${message}`);
      if (exhausted) await alertOwner(ref.lead.id, attempts, message);
    }
  }
  return { done, failed };
}

async function alertOwner(leadId: string, attempts: number, message: string) {
  const owner = ownerId();
  if (!owner) return;
  try {
    await sendMessage(
      owner,
      `⚠️ Не удалось отправить уведомление о заявке #${leadId} (попыток: ${attempts}).\nОшибка: <code>${escapeHtml(message)}</code>\n\nЗаявка сохранена в таблице. Повторить: /retry ${leadId}`,
    );
  } catch {
    console.error(`[jobs] owner alert for ${leadId} could not be delivered`);
  }
}

/** Возвращает неудавшиеся уведомления (одной заявки или все) в очередь. */
export async function retryFailed(leadId?: string): Promise<number> {
  const refs = (await readLeads()).filter((r) => r.lead.notify?.status === "failed" && (!leadId || r.lead.id === leadId));
  for (const ref of refs) {
    await saveNotifyState(ref, { status: "pending", attempts: 0, next_at: new Date().toISOString(), error: null });
  }
  return refs.length;
}

export async function countFailed(): Promise<number> {
  return (await readLeads()).filter((r) => r.lead.notify?.status === "failed").length;
}

/** Очистка служебного листа от просроченных записей. */
export async function housekeeping() {
  await kvCleanup();
}
