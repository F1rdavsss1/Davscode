import "server-only";
import { randomUUID } from "node:crypto";
import { site } from "@/config/site";
import {
  BUDGETS,
  BUDGET_LABELS,
  CONTACT_ERRORS,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  TIMELINES,
  TIMELINE_LABELS,
  normalizeContact,
  stepSchemas,
  type Budget,
  type ContactMethod,
  type ProjectType,
  type Timeline,
} from "../leadSchema";
import { createLead } from "../leads";
import { ownerId } from "../env";
import { hit } from "../rateLimit";
import { escapeHtml as e, sendMessage, type InlineKeyboard } from "../telegram";
import { clearSession, getSession, linkMessage, setSession } from "./session";
import type { TgCallback, TgMessage, TgUser } from "./types";

type Brief = {
  key: string;
  projectType?: ProjectType;
  description?: string;
  budget?: Budget;
  timeline?: Timeline;
  name?: string;
  contactMethod?: ContactMethod;
  contact?: string;
};

const QUESTIONS_PER_HOUR = 20;

export async function showMenu(chatId: number) {
  const keyboard: InlineKeyboard = [
    [{ text: "Портфолио", url: `${site.url}/cases` }],
    [{ text: "Оставить заявку", callback_data: "M:lead" }],
    [{ text: "Задать вопрос", callback_data: "M:ask" }],
  ];
  await sendMessage(
    chatId,
    [
      "Привет! Это бот <b>DavsCode</b> — независимого разработчика сайтов и Telegram-ботов для малого бизнеса.",
      "",
      "Здесь можно оставить заявку на проект или задать вопрос — сообщения читаю я лично.",
      site.telegram ? `Написать напрямую: @${site.telegram.username}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    keyboard,
  );
}

const cancelRow = [{ text: "Отменить", callback_data: "B:x" }];

async function askType(chatId: number) {
  await sendMessage(chatId, "<b>Шаг 1 / 4 · Тип проекта</b>\nЧто будем делать?", [
    ...PROJECT_TYPES.map((t) => [{ text: PROJECT_TYPE_LABELS[t], callback_data: `B:t:${t}` }]),
    cancelRow,
  ]);
}

export async function startBrief(chatId: number, userId: number) {
  await setSession(userId, "brief_type", { key: randomUUID() } satisfies Brief);
  await askType(chatId);
}

export async function startQuestion(chatId: number, userId: number) {
  await setSession(userId, "asking");
  await sendMessage(chatId, "Напишите вопрос одним сообщением — передам его разработчику, ответ придёт сюда.", [
    [{ text: "Завершить диалог", callback_data: "Q:end" }],
  ]);
}

/** Обрабатывает callback клиентского сценария. Возвращает false, если кнопка не относится к клиенту. */
export async function handleClientCallback(cb: TgCallback): Promise<string | false> {
  const chatId = cb.message?.chat.id ?? cb.from.id;
  const userId = cb.from.id;
  const data = cb.data ?? "";

  if (data === "M:lead") return startBrief(chatId, userId).then(() => "");
  if (data === "M:ask") return startQuestion(chatId, userId).then(() => "");
  if (data === "Q:end") {
    await clearSession(userId);
    await showMenu(chatId);
    return "Диалог завершён";
  }
  if (!data.startsWith("B:")) return false;

  const session = await getSession(userId);
  if (data === "B:x") {
    await clearSession(userId);
    await sendMessage(chatId, "Заявка отменена. Если передумаете — нажмите /start.");
    return "";
  }
  if (!session || !session.state.startsWith("brief_")) return "Эта кнопка устарела. Начните заново: /start";
  const brief = session.data as Brief;
  const [, field, value] = data.split(":");

  if (field === "t" && session.state === "brief_type" && (PROJECT_TYPES as readonly string[]).includes(value)) {
    brief.projectType = value as ProjectType;
    await setSession(userId, "brief_desc", brief);
    await sendMessage(
      chatId,
      "<b>Шаг 2 / 4 · Задача</b>\nОпишите, что нужно разработать и какую задачу должен решать проект.\n\n<i>Например: «Лендинг для стоматологии с онлайн-записью и уведомлениями в Telegram».</i>",
      [cancelRow],
    );
    return "";
  }
  if (field === "b" && session.state === "brief_budget" && (BUDGETS as readonly string[]).includes(value)) {
    brief.budget = value as Budget;
    await setSession(userId, "brief_timeline", brief);
    await sendMessage(chatId, "<b>Шаг 4 / 4 · Сроки</b>\nКогда нужен результат?", [
      ...TIMELINES.map((t) => [{ text: TIMELINE_LABELS[t], callback_data: `B:l:${t}` }]),
      cancelRow,
    ]);
    return "";
  }
  if (field === "l" && session.state === "brief_timeline" && (TIMELINES as readonly string[]).includes(value)) {
    brief.timeline = value as Timeline;
    await setSession(userId, "brief_name", brief);
    await sendMessage(chatId, "Почти готово. Как к вам обращаться?", [
      ...(cb.from.first_name ? [[{ text: `Использовать «${cb.from.first_name.slice(0, 30)}»`, callback_data: "B:n" }]] : []),
      cancelRow,
    ]);
    return "";
  }
  if (field === "n" && session.state === "brief_name" && cb.from.first_name) {
    brief.name = cb.from.first_name.slice(0, 80);
    await askContactMethod(chatId, userId, cb.from, brief);
    return "";
  }
  if (field === "m" && session.state === "brief_method") {
    if (value === "telegram") {
      brief.contactMethod = "telegram";
      brief.contact = telegramContact(cb.from);
      await askConsent(chatId, userId, brief);
    } else if (value === "phone" || value === "email") {
      brief.contactMethod = value;
      await setSession(userId, "brief_contact", brief);
      await sendMessage(chatId, value === "phone" ? "Напишите номер телефона." : "Напишите email.", [cancelRow]);
    }
    return "";
  }
  if (field === "ok" && session.state === "brief_consent") {
    await submitBrief(chatId, cb.from, brief);
    return "Заявка отправлена";
  }
  return "Эта кнопка устарела";
}

/** Обрабатывает текст клиента. Возвращает false, если сообщение не относится к активному сценарию. */
export async function handleClientText(msg: TgMessage): Promise<boolean> {
  const from = msg.from!;
  const text = msg.text?.trim() ?? "";
  const session = await getSession(from.id);
  if (!session) return false;
  const brief = session.data as Brief;

  switch (session.state) {
    case "brief_desc": {
      const parsed = stepSchemas.description.safeParse(text);
      if (!parsed.success) {
        await sendMessage(msg.chat.id, parsed.error.issues[0].message);
        return true;
      }
      brief.description = parsed.data;
      await setSession(from.id, "brief_budget", brief);
      await sendMessage(msg.chat.id, "<b>Шаг 3 / 4 · Бюджет</b>\nНа какой бюджет ориентируетесь?", [
        ...BUDGETS.map((b) => [{ text: BUDGET_LABELS[b], callback_data: `B:b:${b}` }]),
        cancelRow,
      ]);
      return true;
    }
    case "brief_name": {
      const parsed = stepSchemas.name.safeParse(text);
      if (!parsed.success) {
        await sendMessage(msg.chat.id, parsed.error.issues[0].message);
        return true;
      }
      brief.name = parsed.data;
      await askContactMethod(msg.chat.id, from.id, from, brief);
      return true;
    }
    case "brief_contact": {
      const method = brief.contactMethod ?? "phone";
      const contact = normalizeContact(method, text);
      if (!contact) {
        await sendMessage(msg.chat.id, CONTACT_ERRORS[method]);
        return true;
      }
      brief.contact = contact;
      await askConsent(msg.chat.id, from.id, brief);
      return true;
    }
    case "asking":
      await forwardQuestion(msg);
      return true;
    default:
      if (session.state.startsWith("brief_")) {
        await sendMessage(msg.chat.id, "Выберите вариант кнопкой выше или нажмите «Отменить».");
        return true;
      }
      return false;
  }
}

function telegramContact(user: TgUser): string {
  // Если username нет, связь возможна через бота по Telegram ID.
  return user.username ? `@${user.username}` : `id:${user.id}`;
}

async function askContactMethod(chatId: number, userId: number, user: TgUser, brief: Brief) {
  await setSession(userId, "brief_method", brief);
  await sendMessage(chatId, "Как удобнее связаться?", [
    [{ text: `Telegram (${user.username ? `@${user.username}` : "этот аккаунт"})`, callback_data: "B:m:telegram" }],
    [{ text: "Телефон", callback_data: "B:m:phone" }, { text: "Email", callback_data: "B:m:email" }],
    cancelRow,
  ]);
}

async function askConsent(chatId: number, userId: number, brief: Brief) {
  await setSession(userId, "brief_consent", brief);
  const summary = [
    "<b>Проверьте заявку</b>",
    "",
    `Тип: ${PROJECT_TYPE_LABELS[brief.projectType!]}`,
    `Задача: ${e(brief.description ?? "")}`,
    `Бюджет: ${BUDGET_LABELS[brief.budget!]}`,
    `Сроки: ${TIMELINE_LABELS[brief.timeline!]}`,
    `Имя: ${e(brief.name ?? "")}`,
    `Контакт: ${e(brief.contact ?? "")}`,
    "",
    `Нажимая «Согласен и отправить», вы соглашаетесь на обработку персональных данных в соответствии с <a href="${site.url}/privacy">политикой</a>.`,
  ].join("\n");
  await sendMessage(chatId, summary, [
    [{ text: "Согласен и отправить", callback_data: "B:ok" }],
    [{ text: "Политика обработки данных", url: `${site.url}/privacy` }],
    cancelRow,
  ]);
}

async function submitBrief(chatId: number, user: TgUser, brief: Brief) {
  // Повторное нажатие безопасно: ключ заявки тот же, дубль не создастся.
  const saved = await createLead({
    idempotencyKey: `bot:${brief.key}`,
    source: "bot",
    projectType: brief.projectType!,
    description: brief.description!,
    budget: brief.budget!,
    timeline: brief.timeline!,
    name: brief.name!,
    contactMethod: brief.contactMethod!,
    contact: brief.contact!,
    telegramUserId: user.id,
    firstTouch: { utm_source: "telegram_bot" },
    lastTouch: { utm_source: "telegram_bot" },
  }).catch((err) => {
    console.error("[bot] save failed:", err instanceof Error ? err.message : "unknown");
    return null;
  });
  if (!saved) {
    await sendMessage(chatId, "Не удалось сохранить заявку — временный сбой. Ответы сохранены, нажмите «Согласен и отправить» ещё раз через минуту.");
    return;
  }
  const { lead } = saved;
  await clearSession(user.id);
  await sendMessage(
    chatId,
    `Спасибо! Заявка <b>#${lead.id}</b> принята. Я постараюсь ответить в течение часа в рабочее время. Пока можете посмотреть портфолио.`,
    [[{ text: "Портфолио", url: `${site.url}/cases` }]],
  );
}

async function forwardQuestion(msg: TgMessage) {
  const from = msg.from!;
  const owner = ownerId();
  if (!msg.text) {
    await sendMessage(msg.chat.id, "Пока я принимаю только текстовые сообщения.");
    return;
  }
  if (!(await hit(`q:${from.id}`, QUESTIONS_PER_HOUR, 3600))) {
    await sendMessage(msg.chat.id, "Слишком много сообщений подряд. Попробуйте чуть позже.");
    return;
  }
  if (!owner) {
    await sendMessage(msg.chat.id, "Не получилось передать вопрос. Попробуйте позже.");
    return;
  }
  const who = [e(from.first_name ?? "Без имени"), from.username ? `@${e(from.username)}` : null, `id <code>${from.id}</code>`]
    .filter(Boolean)
    .join(" · ");
  const sent = await sendMessage(
    owner,
    `💬 <b>Вопрос</b> от ${who}\n\n${e(msg.text.slice(0, 3500))}\n\n<i>Ответьте реплаем на это сообщение — ответ уйдёт этому клиенту.</i>`,
  );
  await linkMessage(sent.message_id, from.id);
  await sendMessage(msg.chat.id, "Передал разработчику. Ответ придёт сюда. Можно дописать ещё сообщение.", [
    [{ text: "Завершить диалог", callback_data: "Q:end" }],
  ]);
}
