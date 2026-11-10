import "server-only";
import { a1, ensureSheet, formatDate, sheetsApi } from "./google";
import { reportTimezone } from "./env";

/*
 * Скрытый лист «Журнал»: кто, когда и что сделал с заявкой (ТЗ 1.4, 9.7).
 * Запись в журнал не должна ломать основное действие: при сбое — только лог.
 */

export const LOG_SHEET = "Журнал";
const HEADERS = ["Дата", "ID заявки", "Кто", "Действие", "Из статуса", "В статус", "Детали"];

export type LogEvent = {
  leadId: string;
  actor: string;
  action: string;
  from?: string | null;
  to?: string | null;
  payload?: Record<string, unknown>;
};

export async function logEvents(events: LogEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    await ensureSheet(LOG_SHEET, HEADERS, { hidden: true });
    const now = formatDate(new Date(), reportTimezone());
    await sheetsApi(`/values/${a1(LOG_SHEET, "A:G")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: {
        values: events.map((e) => [
          now,
          e.leadId,
          e.actor,
          e.action,
          e.from ?? "",
          e.to ?? "",
          e.payload && Object.keys(e.payload).length ? JSON.stringify(e.payload) : "",
        ]),
      },
    });
  } catch (err) {
    console.error("[log] failed:", err instanceof Error ? err.message : "unknown");
  }
}

export const logEvent = (e: LogEvent) => logEvents([e]);
