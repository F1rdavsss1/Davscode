import "server-only";
import { db } from "../db";

export type Session = { state: string; data: Record<string, unknown> };

export async function getSession(tgId: number): Promise<Session | null> {
  const [row] = await db()<{ state: string; data: Record<string, unknown> }[]>`
    select state, data from bot_sessions where tg_id = ${tgId} and updated_at > now() - interval '1 day'
  `;
  return row ?? null;
}

export async function setSession(tgId: number, state: string, data: Record<string, unknown> = {}) {
  await db()`
    insert into bot_sessions (tg_id, state, data, updated_at) values (${tgId}, ${state}, ${db().json(data as never)}, now())
    on conflict (tg_id) do update set state = excluded.state, data = excluded.data, updated_at = now()
  `;
}

export async function clearSession(tgId: number) {
  await db()`delete from bot_sessions where tg_id = ${tgId}`;
}

export async function rememberUser(user: { id: number; username?: string; first_name?: string }) {
  await db()`
    insert into telegram_users (tg_id, username, first_name) values (${user.id}, ${user.username ?? null}, ${user.first_name ?? null})
    on conflict (tg_id) do update set username = excluded.username, first_name = excluded.first_name, last_seen_at = now()
  `;
}

export async function linkMessage(ownerMessageId: number, clientTgId: number, leadId: string | null = null) {
  await db()`
    insert into message_links (owner_message_id, client_tg_id, lead_id) values (${ownerMessageId}, ${clientTgId}, ${leadId})
    on conflict (owner_message_id) do nothing
  `;
}

export async function linkedClient(ownerMessageId: number): Promise<{ client: number; leadId: string | null } | null> {
  const [row] = await db()<{ client_tg_id: string; lead_id: string | null }[]>`
    select client_tg_id::text, lead_id from message_links where owner_message_id = ${ownerMessageId}
  `;
  return row ? { client: Number(row.client_tg_id), leadId: row.lead_id } : null;
}

/** Повторная доставка вебхука с тем же update_id обрабатывается один раз. */
export async function markUpdateProcessed(updateId: number): Promise<boolean> {
  const rows = await db()`insert into processed_updates (update_id) values (${updateId}) on conflict do nothing returning update_id`;
  return rows.length > 0;
}
