import "server-only";
import { createSign } from "node:crypto";
import { requireEnv } from "./env";

// Клиент Google Sheets API на сервисном аккаунте (без SDK — только fetch и подпись JWT).

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sheetsApi<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const id = requireEnv("GOOGLE_SHEETS_ID");
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheets ${init.method ?? "GET"}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export function sheetsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SHEETS_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

/** Диапазон в A1-нотации для URL: 'Лист'!A1:B2 */
export const a1 = (sheet: string, range: string) => encodeURIComponent(`'${sheet}'!${range}`);

/** Номер колонки (1 = A) → буква. */
export function col(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Номер первой строки из ответа append: "'Заявки'!A5:U5" → 5. */
export function rowFromRange(range: string | undefined): number | null {
  const m = range?.match(/![A-Z]+(\d+)/);
  return m ? Number(m[1]) : null;
}

const sheetIds = new Map<string, number>();
const prepared = new Set<string>();

async function loadSheetIds() {
  const meta = await sheetsApi<{ sheets: { properties: { title: string; sheetId: number } }[] }>(
    "?fields=sheets.properties(title,sheetId)",
  );
  for (const s of meta.sheets) sheetIds.set(s.properties.title, s.properties.sheetId);
}

/**
 * Возвращает sheetId листа и при первом обращении в процессе проверяет, что лист есть
 * и у него правильные заголовки. Отсутствующий лист создаётся (служебные — скрытыми).
 */
export async function ensureSheet(title: string, headers: string[], opts: { hidden?: boolean } = {}): Promise<number> {
  if (prepared.has(title) && sheetIds.has(title)) return sheetIds.get(title)!;
  if (!sheetIds.has(title)) await loadSheetIds();
  if (!sheetIds.has(title)) {
    try {
      const res = await sheetsApi<{ replies: { addSheet: { properties: { sheetId: number } } }[] }>(":batchUpdate", {
        method: "POST",
        body: { requests: [{ addSheet: { properties: { title, hidden: opts.hidden ?? false, gridProperties: { frozenRowCount: 1 } } } }] },
      });
      sheetIds.set(title, res.replies[0].addSheet.properties.sheetId);
    } catch (err) {
      // Параллельный вызов мог создать лист раньше нас.
      await loadSheetIds();
      if (!sheetIds.has(title)) throw err;
    }
  }
  const range = `A1:${col(headers.length)}1`;
  const current = await sheetsApi<{ values?: string[][] }>(`/values/${a1(title, range)}`);
  if ((current.values?.[0] ?? []).join("\u0001") !== headers.join("\u0001")) {
    await sheetsApi(`/values/${a1(title, range)}?valueInputOption=RAW`, { method: "PUT", body: { values: [headers] } });
  }
  prepared.add(title);
  return sheetIds.get(title)!;
}

/** Удаляет строки (номера с 1). Удаляем снизу вверх, чтобы номера не сдвигались. */
export async function deleteRows(title: string, rows: number[]) {
  if (rows.length === 0) return;
  const sheetId = sheetIds.get(title);
  if (sheetId === undefined) return;
  const requests = [...new Set(rows)]
    .sort((a, b) => b - a)
    .map((r) => ({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: r - 1, endIndex: r } } }));
  await sheetsApi(":batchUpdate", { method: "POST", body: { requests } });
}

/** «ГГГГ-ММ-ДД ЧЧ:ММ» в заданном часовом поясе — сортируется как текст. */
export function formatDate(value: Date | string, tz: string) {
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
