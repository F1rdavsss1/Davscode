import "server-only";
import { createSign } from "node:crypto";
import { requireEnv } from "./env";
import { BUDGET_LABELS, CONTACT_METHOD_LABELS, PROJECT_TYPE_LABELS, REJECT_REASON_LABELS, STATUS_LABELS, TIMELINE_LABELS } from "./leadSchema";
import type { LeadRow } from "./leads";

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
  "Ссылка на кейс",
  "Заметки",
  "UTM Source",
  "UTM Medium",
  "UTM Campaign",
  "UTM Content",
  "UTM Term",
  "Дата последнего изменения",
  "Состояние синхронизации",
];

// Колонка M («Заметки») редактируется вручную и системой никогда не перезаписывается.
const NOTES_COLUMN_INDEX = 12;

let cachedToken: { value: string; expiresAt: number } | null = null;

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const email = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const key = requireEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: email,
      // Минимально необходимая область: только таблицы, без доступа к Drive.
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Google OAuth: HTTP ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function sheetsApi(path: string, init: { method?: string; body?: unknown } = {}) {
  const id = requireEnv("GOOGLE_SHEETS_ID");
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheets ${init.method ?? "GET"}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

const range = (a1: string) => encodeURIComponent(`'${LEADS_SHEET}'!${a1}`);

/** «ГГГГ-ММ-ДД ЧЧ:ММ» — сортируется как текст, и формулы листа «Аналитика» фильтруют по префиксу месяца. */
function formatDate(value: Date | string, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function leadToRow(lead: LeadRow, tz: string): string[] {
  const t = lead.first_touch ?? {};
  const contact = `${CONTACT_METHOD_LABELS[lead.contact_method]}: ${lead.contact}`;
  return [
    lead.id,
    formatDate(lead.created_at, tz),
    lead.source === "site" ? "Сайт" : "Бот",
    PROJECT_TYPE_LABELS[lead.project_type],
    lead.description,
    BUDGET_LABELS[lead.budget],
    TIMELINE_LABELS[lead.timeline],
    lead.name,
    contact,
    STATUS_LABELS[lead.status],
    lead.reject_reason
      ? REJECT_REASON_LABELS[lead.reject_reason] + (lead.reject_note ? `: ${lead.reject_note}` : "")
      : "",
    lead.case_url ?? "",
    "", // Заметки — не трогаем
    t.utm_source ?? "",
    t.utm_medium ?? "",
    t.utm_campaign ?? "",
    t.utm_content ?? "",
    t.utm_term ?? "",
    formatDate(lead.updated_at, tz),
    `OK ${formatDate(new Date(), tz)}`,
  ];
}

/**
 * Добавляет или обновляет строку заявки. Строка ищется по ID в колонке A,
 * поэтому повторная синхронизация не создаёт дубликатов, а сортировка таблицы ей не мешает.
 * Значения пишутся как RAW — текст клиента не может стать формулой.
 */
export async function upsertLeadRow(lead: LeadRow, tz: string): Promise<void> {
  const column = (await sheetsApi(`/values/${range("A:A")}`)) as { values?: string[][] };
  const ids = column.values?.map((r) => r[0]) ?? [];
  const row = leadToRow(lead, tz);

  if (ids.length === 0) {
    await sheetsApi(`/values/${range("A1:T1")}?valueInputOption=RAW`, {
      method: "PUT",
      body: { values: [LEAD_COLUMNS] },
    });
    ids.push(LEAD_COLUMNS[0]);
  }

  const index = ids.indexOf(lead.id);
  if (index === -1) {
    await sheetsApi(`/values/${range("A:T")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: { values: [row] },
    });
    return;
  }

  const n = index + 1;
  await sheetsApi(`/values:batchUpdate`, {
    method: "POST",
    body: {
      valueInputOption: "RAW",
      data: [
        { range: `'${LEADS_SHEET}'!A${n}:L${n}`, values: [row.slice(0, NOTES_COLUMN_INDEX)] },
        { range: `'${LEADS_SHEET}'!N${n}:T${n}`, values: [row.slice(NOTES_COLUMN_INDEX + 1)] },
      ],
    },
  });
}

export function sheetsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SHEETS_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}
