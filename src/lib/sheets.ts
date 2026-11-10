import "server-only";
import { a1, col, deleteRows, ensureSheet, formatDate, rowFromRange, sheetsApi } from "./google";
import { BUDGET_LABELS, CONTACT_METHOD_LABELS, PROJECT_TYPE_LABELS, REJECT_REASON_LABELS, STATUS_LABELS, TIMELINE_LABELS } from "./leadSchema";
import type { StoredLead } from "./leads";

/*
 * Лист «Заявки» — основное хранилище заявок (пока нет сервера с базой).
 *
 * A–U — колонки для человека (ТЗ 12.2). V — служебная копия заявки в JSON:
 * по ней система читает заявку обратно, поэтому видимые колонки можно сортировать
 * и фильтровать, а случайная правка в них будет исправлена при следующей записи.
 * N («Заметки») система никогда не перезаписывает.
 */

export const LEADS_SHEET = "Заявки";

export const LEAD_COLUMNS = [
  "ID",
  "Дата создания",
  "Источник",
  "Тип проекта",
  "Задача",
  "Бюджет",
  "Срок",
  "Имя",
  "Контакт",
  "Статус",
  "Причина отказа",
  "№ договора",
  "Ссылка на кейс",
  "Заметки",
  "UTM Source",
  "UTM Medium",
  "UTM Campaign",
  "UTM Content",
  "UTM Term",
  "Дата последнего изменения",
  "Состояние синхронизации",
  "Служебные данные (не редактировать)",
];

const NOTES = LEAD_COLUMNS.indexOf("Заметки"); // 13 → колонка N
const DATA = LEAD_COLUMNS.length - 1; // 21 → колонка V
const LAST = col(LEAD_COLUMNS.length); // "V"

export type LeadRef = { row: number; lead: StoredLead };

const ensureLeadsSheet = () => ensureSheet(LEADS_SHEET, LEAD_COLUMNS);

function notifyLabel(lead: StoredLead, tz: string): string {
  const n = lead.notify;
  if (n.status === "done") return `Уведомление отправлено ${n.done_at ? formatDate(n.done_at, tz) : ""}`.trim();
  if (n.status === "failed") return "Уведомление не доставлено — /retry в боте";
  return n.attempts > 0 ? `Уведомление: повтор (попыток ${n.attempts})` : "Уведомление в очереди";
}

function leadToRow(lead: StoredLead, tz: string): string[] {
  const t = lead.first_touch ?? {};
  return [
    lead.id,
    formatDate(lead.created_at, tz),
    lead.source === "site" ? "Сайт" : "Бот",
    PROJECT_TYPE_LABELS[lead.project_type],
    lead.description,
    BUDGET_LABELS[lead.budget],
    TIMELINE_LABELS[lead.timeline],
    lead.name,
    `${CONTACT_METHOD_LABELS[lead.contact_method]}: ${lead.contact}`,
    STATUS_LABELS[lead.status],
    lead.reject_reason ? REJECT_REASON_LABELS[lead.reject_reason] + (lead.reject_note ? `: ${lead.reject_note}` : "") : "",
    lead.contract_number ?? "",
    lead.case_url ?? "",
    "", // Заметки — не трогаем
    t.utm_source ?? "",
    t.utm_medium ?? "",
    t.utm_campaign ?? "",
    t.utm_content ?? "",
    t.utm_term ?? "",
    formatDate(lead.updated_at, tz),
    notifyLabel(lead, tz),
    JSON.stringify(lead),
  ];
}

function parseLead(raw: string | undefined): StoredLead | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as StoredLead;
    if (typeof d?.id !== "string" || typeof d.idempotency_key !== "string") return null;
    return { ...d, created_at: new Date(d.created_at), updated_at: new Date(d.updated_at) };
  } catch {
    return null;
  }
}

/** Все заявки в порядке строк. Строки без служебных данных (ручные, пустые) пропускаются. */
export async function readLeads(): Promise<LeadRef[]> {
  await ensureLeadsSheet();
  const res = await sheetsApi<{ values?: string[][] }>(`/values/${a1(LEADS_SHEET, `A2:${LAST}`)}`);
  const out: LeadRef[] = [];
  (res.values ?? []).forEach((cells, i) => {
    const lead = parseLead(cells[DATA]);
    if (lead) out.push({ row: i + 2, lead });
  });
  return out;
}

/** Добавляет строку и возвращает её номер. Значения пишутся как RAW — текст клиента не станет формулой. */
export async function appendLead(lead: StoredLead, tz: string): Promise<number> {
  await ensureLeadsSheet();
  const res = await sheetsApi<{ updates?: { updatedRange?: string } }>(
    `/values/${a1(LEADS_SHEET, `A:${LAST}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: { values: [leadToRow(lead, tz)] } },
  );
  const row = rowFromRange(res.updates?.updatedRange);
  if (!row) throw new Error("Google Sheets: append did not return a row");
  return row;
}

/**
 * Перезаписывает строку заявки целиком, кроме колонки «Заметки».
 * Номер строки — только подсказка: если таблицу отсортировали, строка ищется заново по ID,
 * чтобы не затереть чужую заявку.
 */
export async function writeLead(hintRow: number, lead: StoredLead, tz: string, currentId = lead.id): Promise<void> {
  const check = await sheetsApi<{ values?: string[][] }>(`/values/${a1(LEADS_SHEET, `${LAST}${hintRow}`)}`);
  let row = hintRow;
  if (parseLead(check.values?.[0]?.[0])?.id !== currentId) {
    const found = (await readLeads()).find((r) => r.lead.id === currentId);
    if (!found) throw new Error(`Lead ${currentId} not found in sheet`);
    row = found.row;
  }
  const values = leadToRow(lead, tz);
  await sheetsApi(`/values:batchUpdate`, {
    method: "POST",
    body: {
      valueInputOption: "RAW",
      data: [
        { range: `'${LEADS_SHEET}'!A${row}:${col(NOTES)}${row}`, values: [values.slice(0, NOTES)] },
        { range: `'${LEADS_SHEET}'!${col(NOTES + 2)}${row}:${LAST}${row}`, values: [values.slice(NOTES + 1)] },
      ],
    },
  });
}

export async function deleteLeadRow(row: number): Promise<void> {
  await ensureLeadsSheet();
  await deleteRows(LEADS_SHEET, [row]);
}
