import "server-only";
import { a1, deleteRows, ensureSheet, sheetsApi, sheetsConfigured } from "./google";

/*
 * Скрытый лист «Служебное» — простое хранилище «ключ → значение» со сроком жизни.
 * Здесь лежат короткоживущие данные: состояние диалогов бота, связи «сообщение → клиент»,
 * обработанные апдейты Telegram и счётчики rate limit.
 *
 * Ограничение: у Google Sheets нет транзакций, поэтому при одновременных запросах
 * возможны редкие гонки. Для текущего объёма заявок это приемлемо; при переезде
 * на PostgreSQL (db/schema.sql) это хранилище заменяется таблицами.
 */

export const KV_SHEET = "Служебное";
const HEADERS = ["Ключ", "Значение", "Истекает (unix ms)"];

type Entry = { row: number; key: string; value: string; expires: number };

const ensureKv = () => ensureSheet(KV_SHEET, HEADERS, { hidden: true });

/*
 * Для локальной разработки без ключей Google — хранилище в памяти процесса `next dev`,
 * чтобы можно было пройти разделы и диалоги бота. В production без таблицы — ошибка, как и раньше.
 */
const memory: Entry[] = [];
const useMemory = () => !sheetsConfigured() && process.env.NODE_ENV !== "production";

async function readAll(): Promise<Entry[]> {
  if (useMemory()) return memory.map((e, i) => ({ ...e, row: i + 2 }));
  await ensureKv();
  const res = await sheetsApi<{ values?: string[][] }>(`/values/${a1(KV_SHEET, "A2:C")}`);
  return (res.values ?? []).map((r, i) => ({ row: i + 2, key: r[0] ?? "", value: r[1] ?? "", expires: Number(r[2]) || 0 }));
}

const alive = (e: Entry, now = Date.now()) => e.key !== "" && e.value !== "" && e.expires > now;

/** Последняя живая запись по ключу (если из-за гонки их несколько). */
function find(entries: Entry[], key: string): Entry | undefined {
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i].key === key) return entries[i];
  return undefined;
}

async function writeRow(row: number, key: string, value: string, expires: number) {
  if (useMemory()) {
    memory[row - 2] = { row, key, value, expires };
    return;
  }
  await sheetsApi(`/values/${a1(KV_SHEET, `A${row}:C${row}`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: { values: [[key, value, String(expires)]] },
  });
}

async function appendRow(key: string, value: string, expires: number) {
  if (useMemory()) {
    memory.push({ row: memory.length + 2, key, value, expires });
    return;
  }
  await sheetsApi(`/values/${a1(KV_SHEET, "A:C")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: { values: [[key, value, String(expires)]] },
  });
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const e = find(await readAll(), key);
  if (!e || !alive(e)) return null;
  try {
    return JSON.parse(e.value) as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const expires = Date.now() + ttlSeconds * 1000;
  const e = find(await readAll(), key);
  if (e) await writeRow(e.row, key, JSON.stringify(value), expires);
  else await appendRow(key, JSON.stringify(value), expires);
}

export async function kvDelete(key: string): Promise<void> {
  const e = find(await readAll(), key);
  // Строку не удаляем (номера строк сдвинулись бы под параллельными запросами) — просто гасим значение.
  if (e && e.value !== "") await writeRow(e.row, key, "", 0);
}

/** Записывает ключ, только если живого значения ещё нет. true — записали впервые. */
export async function kvAddIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
  const entries = await readAll();
  const e = find(entries, key);
  if (e && alive(e)) return false;
  const expires = Date.now() + ttlSeconds * 1000;
  if (e) await writeRow(e.row, key, "1", expires);
  else await appendRow(key, "1", expires);
  return true;
}

/** Увеличивает счётчик и возвращает новое значение. */
export async function kvIncrement(key: string, ttlSeconds: number): Promise<number> {
  const e = find(await readAll(), key);
  const current = e && alive(e) ? Number(e.value) || 0 : 0;
  const next = current + 1;
  const expires = e && alive(e) ? e.expires : Date.now() + ttlSeconds * 1000;
  if (e) await writeRow(e.row, key, String(next), expires);
  else await appendRow(key, String(next), expires);
  return next;
}

/** Удаляет просроченные строки. Вызывается по расписанию (cron). */
export async function kvCleanup(): Promise<number> {
  const now = Date.now();
  const dead = (await readAll()).filter((e) => !alive(e, now)).map((e) => e.row);
  if (useMemory()) {
    for (const row of [...dead].sort((a, b) => b - a)) memory.splice(row - 2, 1);
    return dead.length;
  }
  await deleteRows(KV_SHEET, dead);
  return dead.length;
}
