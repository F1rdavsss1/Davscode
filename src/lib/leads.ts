import "server-only";
import type postgres from "postgres";
import { db } from "./db";
import {
  CONSENT_VERSION,
  type Budget,
  type ContactMethod,
  type LeadStatus,
  type ProjectType,
  type RejectReason,
  type Timeline,
  type Touch,
} from "./leadSchema";

export type LeadRow = {
  id: string;
  created_at: Date;
  updated_at: Date;
  source: "site" | "bot";
  project_type: ProjectType;
  description: string;
  budget: Budget;
  timeline: Timeline;
  name: string;
  contact_method: ContactMethod;
  contact: string;
  telegram_user_id: string | null;
  status: LeadStatus;
  reject_reason: RejectReason | null;
  reject_note: string | null;
  case_url: string | null;
  result_note: string | null;
  first_touch: Touch;
  last_touch: Touch;
};

export type NewLead = {
  idempotencyKey: string;
  source: "site" | "bot";
  projectType: ProjectType;
  description: string;
  budget: Budget;
  timeline: Timeline;
  name: string;
  contactMethod: ContactMethod;
  contact: string;
  telegramUserId?: number | null;
  firstTouch?: Touch;
  lastTouch?: Touch;
};

/**
 * Сохраняет заявку, согласие и задания на доставку в одной транзакции.
 * Повторный вызов с тем же ключом идемпотентности возвращает уже созданную заявку.
 */
export async function createLead(input: NewLead): Promise<{ lead: LeadRow; created: boolean }> {
  const sql = db();
  return sql.begin(async (tx) => {
    const inserted = await tx<LeadRow[]>`
      insert into leads (
        idempotency_key, source, project_type, description, budget, timeline,
        name, contact_method, contact, telegram_user_id, first_touch, last_touch
      ) values (
        ${input.idempotencyKey}, ${input.source}, ${input.projectType}, ${input.description},
        ${input.budget}, ${input.timeline}, ${input.name}, ${input.contactMethod}, ${input.contact},
        ${input.telegramUserId ?? null}, ${tx.json(input.firstTouch ?? {})}, ${tx.json(input.lastTouch ?? {})}
      )
      on conflict (idempotency_key) do nothing
      returning *
    `;
    if (inserted.length === 0) {
      const [existing] = await tx<LeadRow[]>`select * from leads where idempotency_key = ${input.idempotencyKey}`;
      return { lead: existing, created: false };
    }
    const lead = inserted[0];
    await tx`insert into consents (lead_id, version, channel) values (${lead.id}, ${CONSENT_VERSION}, ${input.source})`;
    await tx`
      insert into lead_events (lead_id, actor, action, to_status, payload)
      values (${lead.id}, ${input.source === "site" ? "site" : `tg:${input.telegramUserId}`}, 'created', 'new', '{}'::jsonb)
    `;
    await enqueue(tx, lead.id, ["notify_owner", "sync_sheet"]);
    return { lead, created: true };
  });
}

export async function enqueue(sql: postgres.Sql | postgres.TransactionSql, leadId: string, kinds: ("notify_owner" | "sync_sheet")[]) {
  for (const kind of kinds) {
    await sql`
      insert into jobs (lead_id, kind) values (${leadId}, ${kind})
      on conflict (lead_id, kind) where status = 'pending' do update set next_run_at = now(), updated_at = now()
    `;
  }
}

export async function getLead(id: string): Promise<LeadRow | null> {
  const [lead] = await db()<LeadRow[]>`select * from leads where id = ${id}`;
  return lead ?? null;
}

// Допустимые переходы статусов. Всё остальное отклоняется.
const TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ["in_progress", "rejected"],
  in_progress: ["done", "rejected"],
  rejected: [],
  done: [],
};

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export type TransitionResult =
  | { ok: true; lead: LeadRow }
  | { ok: false; reason: "not_found" | "stale" | "invalid"; lead: LeadRow | null };

/**
 * Атомарно меняет статус, только если он всё ещё равен ожидаемому.
 * Устаревшая или повторно нажатая кнопка получит reason: "stale".
 */
export async function transitionLead(
  id: string,
  expected: LeadStatus,
  to: LeadStatus,
  actor: string,
  extra: { rejectReason?: RejectReason; rejectNote?: string | null } = {},
): Promise<TransitionResult> {
  if (!canTransition(expected, to)) return { ok: false, reason: "invalid", lead: await getLead(id) };
  const sql = db();
  return sql.begin(async (tx) => {
    const [lead] = await tx<LeadRow[]>`
      update leads set
        status = ${to},
        reject_reason = ${extra.rejectReason ?? null},
        reject_note = ${extra.rejectNote ?? null},
        updated_at = now()
      where id = ${id} and status = ${expected}
      returning *
    `;
    if (!lead) {
      const [current] = await tx<LeadRow[]>`select * from leads where id = ${id}`;
      return { ok: false as const, reason: current ? ("stale" as const) : ("not_found" as const), lead: current ?? null };
    }
    await tx`
      insert into lead_events (lead_id, actor, action, from_status, to_status, payload)
      values (${id}, ${actor}, 'status', ${expected}, ${to},
              ${tx.json({ rejectReason: extra.rejectReason ?? null, rejectNote: extra.rejectNote ?? null })})
    `;
    await enqueue(tx, id, ["sync_sheet"]);
    return { ok: true as const, lead };
  });
}

export async function updateLeadFields(
  id: string,
  actor: string,
  fields: { case_url?: string | null; result_note?: string | null; reject_note?: string | null },
): Promise<LeadRow | null> {
  const sql = db();
  return sql.begin(async (tx) => {
    const [lead] = await tx<LeadRow[]>`
      update leads set
        case_url = coalesce(${fields.case_url ?? null}, case_url),
        result_note = coalesce(${fields.result_note ?? null}, result_note),
        reject_note = coalesce(${fields.reject_note ?? null}, reject_note),
        updated_at = now()
      where id = ${id}
      returning *
    `;
    if (!lead) return null;
    await tx`insert into lead_events (lead_id, actor, action, payload) values (${id}, ${actor}, 'update', ${tx.json(fields)})`;
    await enqueue(tx, id, ["sync_sheet"]);
    return lead;
  });
}
