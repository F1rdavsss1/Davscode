import "server-only";
import { reportTimezone } from "./env";
import { logEvents } from "./eventLog";
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
import { appendLead, deleteLeadRow, readLeads, writeLead, type LeadRef } from "./sheets";

/*
 * Заявки хранятся в Google Sheets (лист «Заявки»). Успех клиенту возвращается
 * только после того, как строка записана в таблицу.
 */

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

/** Состояние доставки уведомления владельцу (вместо отдельной очереди заданий). */
export type NotifyState = {
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
  next_at: string;
  done_at?: string | null;
  error?: string | null;
};

/** То, что лежит в служебной колонке строки: заявка + согласие + служебные поля. */
export type StoredLead = LeadRow & {
  idempotency_key: string;
  /** Номер договора DC-ГГГГ-NNN — появится на этапе «Предложение» (ТЗ 7.5). */
  contract_number?: string | null;
  consent: { version: string; given_at: string; channel: "site" | "bot" };
  notify: NotifyState;
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

const formatId = (n: number) => `DC-${String(n).padStart(6, "0")}`;
const idNumber = (id: string) => Number(id.replace(/^DC-/, "")) || 0;
const nextNumber = (rows: LeadRef[]) => rows.reduce((max, r) => Math.max(max, idNumber(r.lead.id)), 0) + 1;

/** Первая (самая ранняя) заявка с этим ключом идемпотентности. */
function byKey(rows: LeadRef[], key: string): LeadRef | undefined {
  return rows.filter((r) => r.lead.idempotency_key === key).sort((a, b) => a.row - b.row)[0];
}

export async function findLeadByKey(key: string): Promise<LeadRow | null> {
  return byKey(await readLeads(), key)?.lead ?? null;
}

/**
 * Сохраняет заявку вместе с согласием. Повторный вызов с тем же ключом возвращает
 * уже созданную заявку. Т.к. в таблице нет транзакций, после записи проверяем гонки:
 * дубль по ключу удаляется, совпавший номер заявки переназначается.
 */
export async function createLead(input: NewLead): Promise<{ lead: LeadRow; created: boolean }> {
  const tz = reportTimezone();
  const before = await readLeads();
  const existing = byKey(before, input.idempotencyKey);
  if (existing) return { lead: existing.lead, created: false };

  const now = new Date();
  const lead: StoredLead = {
    id: formatId(nextNumber(before)),
    created_at: now,
    updated_at: now,
    source: input.source,
    project_type: input.projectType,
    description: input.description,
    budget: input.budget,
    timeline: input.timeline,
    name: input.name,
    contact_method: input.contactMethod,
    contact: input.contact,
    telegram_user_id: input.telegramUserId ? String(input.telegramUserId) : null,
    status: "new",
    reject_reason: null,
    reject_note: null,
    case_url: null,
    result_note: null,
    first_touch: input.firstTouch ?? {},
    last_touch: input.lastTouch ?? {},
    idempotency_key: input.idempotencyKey,
    consent: { version: CONSENT_VERSION, given_at: now.toISOString(), channel: input.source },
    notify: { status: "pending", attempts: 0, next_at: now.toISOString() },
  };
  const row = await appendLead(lead, tz);

  let after = await readLeads();
  const first = byKey(after, input.idempotencyKey);
  if (first && first.row !== row) {
    // Параллельный запрос с тем же ключом успел раньше — наша строка лишняя.
    await deleteLeadRow(row).catch((err) => console.error("[leads] duplicate cleanup failed:", err instanceof Error ? err.message : err));
    return { lead: first.lead, created: false };
  }
  // Одновременно пришли разные заявки и взяли один номер: номер сохраняет строка выше,
  // остальные берут следующий свободный. Строки с тем же ключом — дубли, их удалит другой запрос.
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = after.some(
      (r) => r.row < row && r.lead.id === lead.id && r.lead.idempotency_key !== lead.idempotency_key,
    );
    if (!clash) break;
    const takenId = lead.id;
    lead.id = formatId(nextNumber(after));
    await writeLead(row, lead, tz, takenId);
    after = await readLeads();
  }

  const actor = input.source === "site" ? "site" : `tg:${input.telegramUserId}`;
  await logEvents([
    { leadId: lead.id, actor, action: "created", to: "new" },
    { leadId: lead.id, actor, action: "consent", payload: { version: CONSENT_VERSION, channel: input.source } },
  ]);
  return { lead, created: true };
}

async function findRef(id: string): Promise<LeadRef | null> {
  return (await readLeads()).find((r) => r.lead.id === id) ?? null;
}

export async function getLead(id: string): Promise<LeadRow | null> {
  return (await findRef(id))?.lead ?? null;
}

/**
 * Обновляет только состояние уведомления (без записи в журнал). Заявку перечитываем,
 * чтобы не затереть статус, который владелец мог поменять в этот момент.
 */
export async function saveNotifyState(ref: LeadRef, notify: NotifyState): Promise<void> {
  const fresh = (await findRef(ref.lead.id)) ?? ref;
  await writeLead(fresh.row, { ...fresh.lead, notify }, reportTimezone());
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
 * Меняет статус, только если он всё ещё равен ожидаемому.
 * Устаревшая или повторно нажатая кнопка получит reason: "stale".
 */
export async function transitionLead(
  id: string,
  expected: LeadStatus,
  to: LeadStatus,
  actor: string,
  extra: { rejectReason?: RejectReason; rejectNote?: string | null } = {},
): Promise<TransitionResult> {
  const ref = await findRef(id);
  if (!ref) return { ok: false, reason: "not_found", lead: null };
  if (!canTransition(expected, to)) return { ok: false, reason: "invalid", lead: ref.lead };
  if (ref.lead.status !== expected) return { ok: false, reason: "stale", lead: ref.lead };

  const lead: StoredLead = {
    ...ref.lead,
    status: to,
    reject_reason: extra.rejectReason ?? null,
    reject_note: extra.rejectNote ?? null,
    updated_at: new Date(),
  };
  await writeLead(ref.row, lead, reportTimezone());
  await logEvents([
    {
      leadId: id,
      actor,
      action: "status",
      from: expected,
      to,
      payload: extra.rejectReason ? { rejectReason: extra.rejectReason, rejectNote: extra.rejectNote ?? null } : {},
    },
  ]);
  return { ok: true, lead };
}

export async function updateLeadFields(
  id: string,
  actor: string,
  fields: { case_url?: string | null; result_note?: string | null; reject_note?: string | null },
): Promise<LeadRow | null> {
  const ref = await findRef(id);
  if (!ref) return null;
  const lead: StoredLead = {
    ...ref.lead,
    case_url: fields.case_url ?? ref.lead.case_url,
    result_note: fields.result_note ?? ref.lead.result_note,
    reject_note: fields.reject_note ?? ref.lead.reject_note,
    updated_at: new Date(),
  };
  await writeLead(ref.row, lead, reportTimezone());
  await logEvents([{ leadId: id, actor, action: "update", payload: fields }]);
  return lead;
}

/** Все заявки — для статистики. */
export async function listLeads(): Promise<StoredLead[]> {
  return (await readLeads()).map((r) => r.lead);
}

export { readLeads };
