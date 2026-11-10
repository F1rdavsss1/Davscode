import "server-only";
import { kvAddIfAbsent, kvDelete, kvGet, kvSet } from "../kv";

// Состояние диалогов и связи сообщений хранятся на скрытом листе «Служебное».

export type Session = { state: string; data: Record<string, unknown> };

const DAY = 24 * 3600;

export async function getSession(tgId: number): Promise<Session | null> {
  return kvGet<Session>(`session:${tgId}`);
}

export async function setSession(tgId: number, state: string, data: Record<string, unknown> = {}) {
  await kvSet(`session:${tgId}`, { state, data } satisfies Session, DAY);
}

export async function clearSession(tgId: number) {
  await kvDelete(`session:${tgId}`);
}

/** Связь «сообщение у владельца → клиент», чтобы ответ уходил нужному человеку. Хранится 30 дней. */
export async function linkMessage(ownerMessageId: number, clientTgId: number, leadId: string | null = null) {
  await kvSet(`msg:${ownerMessageId}`, { client: clientTgId, leadId }, 30 * DAY);
}

export async function linkedClient(ownerMessageId: number): Promise<{ client: number; leadId: string | null } | null> {
  return kvGet<{ client: number; leadId: string | null }>(`msg:${ownerMessageId}`);
}

/** Повторная доставка вебхука с тем же update_id обрабатывается один раз. */
export async function markUpdateProcessed(updateId: number): Promise<boolean> {
  return kvAddIfAbsent(`upd:${updateId}`, DAY);
}
