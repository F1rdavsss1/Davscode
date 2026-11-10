import "server-only";
import {
  BUDGET_LABELS,
  CONTACT_METHOD_LABELS,
  PROJECT_TYPE_LABELS,
  REJECT_REASONS,
  REJECT_REASON_LABELS,
  STATUS_LABELS,
  TIMELINE_LABELS,
  type LeadStatus,
} from "../leadSchema";
import type { LeadRow } from "../leads";
import { escapeHtml as e, type InlineKeyboard } from "../telegram";

// Короткие коды статусов для callback_data (лимит Telegram — 64 байта).
export const STATUS_CODE: Record<LeadStatus, string> = { new: "n", in_progress: "w", rejected: "x", done: "d" };
export const CODE_STATUS: Record<string, LeadStatus> = { n: "new", w: "in_progress", x: "rejected", d: "done" };

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Краткая карточка для уведомления: без лишних персональных данных и с обрезанным текстом. */
export function leadCardText(lead: LeadRow): string {
  const lines = [
    `<b>${lead.status === "new" ? "Новая заявка" : "Заявка"} #${lead.id}</b>`,
    "",
    `Тип: ${PROJECT_TYPE_LABELS[lead.project_type]}`,
    `Задача: ${e(truncate(lead.description, 300))}`,
    `Бюджет: ${BUDGET_LABELS[lead.budget]}`,
    `Срок: ${TIMELINE_LABELS[lead.timeline]}`,
    `Имя: ${e(lead.name)}`,
    `Контакт: ${e(lead.contact)}`,
    `Источник: ${lead.source === "site" ? "Сайт" : "Бот"}`,
    `Статус: <b>${STATUS_LABELS[lead.status]}</b>`,
  ];
  if (lead.status === "rejected" && lead.reject_reason) {
    lines.push(`Причина: ${REJECT_REASON_LABELS[lead.reject_reason]}${lead.reject_note ? ` — ${e(lead.reject_note)}` : ""}`);
  }
  if (lead.case_url) lines.push(`Кейс: ${e(lead.case_url)}`);
  return lines.join("\n");
}

export function leadKeyboard(lead: LeadRow): InlineKeyboard {
  const st = STATUS_CODE[lead.status];
  const cb = (action: string) => `L:${action}:${lead.id}:${st}`;
  const open = { text: "Открыть заявку", callback_data: cb("o") };
  switch (lead.status) {
    case "new":
      return [
        [{ text: "Взять в работу", callback_data: cb("t") }, { text: "Отказать", callback_data: cb("j") }],
        [{ text: "Уточнить", callback_data: cb("c") }, open],
      ];
    case "in_progress":
      return [
        [{ text: "Выполнено", callback_data: cb("f") }, { text: "Отказать", callback_data: cb("j") }],
        [{ text: "Уточнить", callback_data: cb("c") }, open],
      ];
    default:
      return [[open]];
  }
}

export function rejectReasonsKeyboard(lead: LeadRow): InlineKeyboard {
  const st = STATUS_CODE[lead.status];
  return [
    ...REJECT_REASONS.map((reason, i) => [{ text: REJECT_REASON_LABELS[reason], callback_data: `R:${lead.id}:${st}:${i}` }]),
    [{ text: "← Назад", callback_data: `L:b:${lead.id}:${st}` }],
  ];
}

/** Полные данные заявки — только по запросу владельца. */
export function leadFullText(lead: LeadRow, tz: string): string {
  const date = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(new Date(d));
  const t = lead.first_touch ?? {};
  const utm = [t.utm_source, t.utm_medium, t.utm_campaign, t.utm_content, t.utm_term].filter(Boolean).join(" / ");
  return [
    `<b>Заявка #${lead.id}</b> · ${STATUS_LABELS[lead.status]}`,
    `Создана: ${date(lead.created_at)} · изменена: ${date(lead.updated_at)}`,
    "",
    `<b>Тип:</b> ${PROJECT_TYPE_LABELS[lead.project_type]}`,
    `<b>Задача:</b>\n${e(lead.description)}`,
    "",
    `<b>Бюджет:</b> ${BUDGET_LABELS[lead.budget]}`,
    `<b>Срок:</b> ${TIMELINE_LABELS[lead.timeline]}`,
    `<b>Имя:</b> ${e(lead.name)}`,
    `<b>Контакт:</b> ${CONTACT_METHOD_LABELS[lead.contact_method]} — ${e(lead.contact)}`,
    lead.telegram_user_id ? `<b>Telegram ID:</b> <code>${lead.telegram_user_id}</code>` : "",
    `<b>Источник:</b> ${lead.source === "site" ? "Сайт" : "Бот"}${utm ? ` · UTM: ${e(utm)}` : ""}`,
    t.referrer ? `<b>Реферер:</b> ${e(t.referrer)}` : "",
    t.landing_page ? `<b>Первая страница:</b> ${e(t.landing_page)}` : "",
    lead.reject_reason ? `<b>Причина отказа:</b> ${REJECT_REASON_LABELS[lead.reject_reason]}${lead.reject_note ? ` — ${e(lead.reject_note)}` : ""}` : "",
    lead.case_url ? `<b>Кейс:</b> ${e(lead.case_url)}` : "",
    lead.result_note ? `<b>Результат:</b> ${e(lead.result_note)}` : "",
  ]
    .filter((line, i, arr) => line !== "" || (arr[i - 1] ?? "") !== "")
    .join("\n");
}

const CLARIFY_QUESTIONS: Record<LeadRow["project_type"], string> = {
  site: "какие страницы должны быть на сайте, есть ли готовые тексты и фото и нужны ли интеграции с другими сервисами?",
  bot: "какие сценарии должен вести бот, кто будет получать заявки и нужно ли подключение к таблице или CRM?",
  automation: "какие сервисы нужно связать, откуда берутся данные и в каком виде нужен результат?",
  other: "что именно должно получиться в итоге и есть ли примеры, на которые можно ориентироваться?",
};

export function clarifyTemplate(lead: LeadRow): string {
  const what = { site: "разработку сайта", bot: "разработку Telegram-бота", automation: "автоматизацию", other: "проект" }[lead.project_type];
  return `Здравствуйте, ${lead.name}! Посмотрел вашу заявку на ${what}. Чтобы точнее оценить сроки и стоимость, уточните, пожалуйста, ${CLARIFY_QUESTIONS[lead.project_type]}`;
}
