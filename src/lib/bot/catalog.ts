import { formatPrice, services, site } from "../../config/site";
import { CASE_KIND_LABELS, cases, getCase, type CaseKind } from "../../content/cases";
import { faq } from "../../content/faq";
import { PROJECT_TYPES, type ProjectType } from "../leadSchema";
import { escapeHtml as e, type InlineButton, type InlineKeyboard } from "../telegram";

/*
 * Разделы бота «Услуги и цены», «Портфолио», «Вопросы и ответы».
 * Тексты строятся из тех же источников, что и сайт (src/config/site.ts,
 * src/content/cases.ts, src/content/faq.ts), поэтому бот и сайт всегда совпадают.
 *
 * callback_data:
 *   M:menu · M:svc · M:cases · M:faq — разделы
 *   C:<slug> — кейс, F:<номер> — ответ на вопрос, P:<тип проекта> — бриф с выбранным типом
 */

export type Screen = { text: string; keyboard: InlineKeyboard };

// Telegram не принимает в кнопках ссылки на localhost — без https ссылки не показываем.
const webUrl = (path = "") => (site.url.startsWith("https://") ? `${site.url}${path}` : null);
const urlButton = (text: string, path: string): InlineButton[] => {
  const url = webUrl(path);
  return url ? [{ text, url }] : [];
};

const KIND_TO_PROJECT: Record<CaseKind, ProjectType> = { site: "site", bot: "bot", automation: "automation" };

export function isProjectType(value: string): value is ProjectType {
  return (PROJECT_TYPES as readonly string[]).includes(value);
}

export function menuScreen(): Screen {
  const site_ = urlButton("Открыть сайт", "");
  return {
    text: [
      "Привет! Это бот <b>DavsCode</b> — независимого разработчика сайтов и Telegram-ботов для малого бизнеса.",
      "",
      "Здесь можно посмотреть услуги и работы, оставить заявку или задать вопрос — сообщения читаю я лично.",
      ...(site.telegram ? [`Написать напрямую: @${e(site.telegram.username)}`] : []),
    ].join("\n"),
    keyboard: [
      [
        { text: "Услуги и цены", callback_data: "M:svc" },
        { text: "Портфолио", callback_data: "M:cases" },
      ],
      [{ text: "Вопросы и ответы", callback_data: "M:faq" }],
      [{ text: "Оставить заявку", callback_data: "M:lead" }],
      [{ text: "Задать вопрос", callback_data: "M:ask" }],
      ...(site_.length ? [site_] : []),
    ],
  };
}

const back: InlineButton = { text: "← Меню", callback_data: "M:menu" };

export function servicesScreen(): Screen {
  const blocks = services.map((s, i) =>
    [
      `<b>${String(i + 1).padStart(2, "0")} · ${e(s.title)}</b>`,
      `<i>${e(formatPrice(s.priceFrom))} · ${e(s.duration)}</i>`,
      e(s.description),
      ...s.features.map((f) => `— ${e(f)}`),
    ].join("\n"),
  );
  return {
    text: [
      "<b>Услуги и цены</b>",
      "",
      blocks.join("\n\n"),
      "",
      "<i>Сроки — ориентир для типовых проектов. Точный срок и стоимость — после брифа. Сложные интеграции оцениваются отдельно.</i>",
    ].join("\n"),
    keyboard: [
      ...services.map((s) => [{ text: `Обсудить: ${s.title}`, callback_data: `P:${s.projectType}` }]),
      [back],
    ],
  };
}

export function casesScreen(): Screen {
  const lines = cases.map(
    (c) => `<b>${e(c.title)}</b> — ${e(c.name)}\n<i>${CASE_KIND_LABELS[c.kind]}${c.concept ? " · Концепт" : ""}</i>`,
  );
  const hasConcepts = cases.some((c) => c.concept);
  const all = urlButton("Все работы на сайте", "/cases");
  return {
    text: [
      "<b>Портфолио</b>",
      "",
      lines.join("\n\n") || "Скоро здесь появятся работы.",
      ...(hasConcepts ? ["", "<i>«Концепт» — демонстрационный проект, а не реальный заказ.</i>"] : []),
    ].join("\n"),
    keyboard: [
      ...cases.map((c) => [{ text: c.title, callback_data: `C:${c.slug}` }]),
      ...(all.length ? [all] : []),
      [back],
    ],
  };
}

export function caseScreen(slug: string): Screen | null {
  const c = getCase(slug);
  if (!c) return null;
  const page = urlButton("Открыть на сайте", `/cases/${c.slug}`);
  return {
    text: [
      `<b>${e(c.title)}</b> — ${e(c.name)}`,
      `<i>${CASE_KIND_LABELS[c.kind]}${c.concept ? " · Концепт, не реальный заказ" : ""} · ${e(c.meta.duration)}</i>`,
      "",
      e(c.summary),
      "",
      "<b>Задача</b>",
      e(c.problem),
      "",
      "<b>Решение</b>",
      e(c.solution),
      "",
      "<b>Функции</b>",
      ...c.features.map((f) => `— ${e(f)}`),
      "",
      `<b>Технологии:</b> ${e(c.stack.join(", "))}`,
      "",
      "<b>Результат и выводы</b>",
      e(c.result),
      e(c.limitations),
    ].join("\n"),
    keyboard: [
      [{ text: "Хочу похожий проект", callback_data: `P:${KIND_TO_PROJECT[c.kind]}` }],
      ...(page.length ? [page] : []),
      [{ text: "← Все работы", callback_data: "M:cases" }],
    ],
  };
}

export function faqScreen(): Screen {
  return {
    text: "<b>Вопросы и ответы</b>\n\nВыберите вопрос — или задайте свой.",
    keyboard: [
      ...faq.map((f, i) => [{ text: f.q, callback_data: `F:${i}` }]),
      [{ text: "Задать свой вопрос", callback_data: "M:ask" }],
      [back],
    ],
  };
}

export function faqAnswerScreen(index: number): Screen | null {
  const item = faq[index];
  if (!item) return null;
  return {
    text: `<b>${e(item.q)}</b>\n\n${e(item.a)}`,
    keyboard: [
      [{ text: "Оставить заявку", callback_data: "M:lead" }],
      [{ text: "Задать свой вопрос", callback_data: "M:ask" }],
      [{ text: "← Все вопросы", callback_data: "M:faq" }],
    ],
  };
}

/** Экран раздела по callback_data. null — это не навигация каталога. */
export function screenFor(data: string): Screen | null | "not_found" {
  if (data === "M:menu") return menuScreen();
  if (data === "M:svc") return servicesScreen();
  if (data === "M:cases") return casesScreen();
  if (data === "M:faq") return faqScreen();
  if (data.startsWith("C:")) return caseScreen(data.slice(2)) ?? "not_found";
  if (data.startsWith("F:")) return faqAnswerScreen(Number(data.slice(2))) ?? "not_found";
  return null;
}

/** Параметр /start <payload> — ссылки с сайта вида t.me/<бот>?start=services. */
export function screenForStart(payload: string): Screen | null {
  switch (payload) {
    case "services":
      return servicesScreen();
    case "cases":
      return casesScreen();
    case "faq":
      return faqScreen();
    default:
      return payload.startsWith("case_") ? caseScreen(payload.slice(5)) : null;
  }
}
