import "server-only";
import { db } from "../db";
import { reportTimezone } from "../env";
import { REJECT_REASONS, STATUS_LABELS, type LeadStatus } from "../leadSchema";
import { getLead, transitionLead, updateLeadFields, type LeadRow } from "../leads";
import { retryFailed } from "../jobs";
import { answerCallback, editMessage, escapeHtml as e, sendMessage, TelegramError } from "../telegram";
import { CODE_STATUS, clarifyTemplate, leadCardText, leadFullText, leadKeyboard, rejectReasonsKeyboard } from "./cards";
import { clearSession, getSession, linkedClient, linkMessage, setSession } from "./session";
import type { TgCallback, TgMessage } from "./types";

const LEAD_ID = /^DC-\d{6,}$/;
const actor = (id: number) => `tg:${id}`;

const ADMIN_HELP = [
  "<b>Команды владельца</b>",
  "/stats — статистика заявок",
  "/lead DC-000001 — открыть заявку",
  "/retry [DC-000001] — повторить неудавшиеся уведомления и синхронизацию",
  "",
  "Чтобы ответить клиенту, ответьте (reply) на его сообщение.",
].join("\n");

/** Вызывается только после проверки, что отправитель — владелец. */
export async function handleOwnerCallback(cb: TgCallback): Promise<void> {
  const chatId = cb.message?.chat.id ?? cb.from.id;
  const messageId = cb.message?.message_id;
  const parts = (cb.data ?? "").split(":");

  if (parts[0] === "L") {
    const [, action, id, st] = parts;
    const expected = CODE_STATUS[st];
    const lead = LEAD_ID.test(id) ? await getLead(id) : null;
    if (!lead || !expected) return answerCallback(cb.id, "Заявка не найдена", true);

    if (action === "o") {
      await sendMessage(chatId, leadFullText(lead, reportTimezone()));
      return answerCallback(cb.id);
    }
    // Кнопка нарисована для другого статуса — показываем актуальное состояние.
    if (lead.status !== expected) return refreshStale(cb, lead);

    switch (action) {
      case "b":
        if (messageId) await editMessage(chatId, messageId, leadCardText(lead), leadKeyboard(lead));
        return answerCallback(cb.id);
      case "j":
        if (messageId) await editMessage(chatId, messageId, `${leadCardText(lead)}\n\n<b>Причина отказа?</b>`, rejectReasonsKeyboard(lead));
        return answerCallback(cb.id);
      case "t":
        await applyTransition(cb, lead, "in_progress");
        return;
      case "f": {
        const ok = await applyTransition(cb, lead, "done");
        if (ok) {
          await setSession(cb.from.id, "case_link", { leadId: lead.id });
          await sendMessage(
            chatId,
            `Заявка #${lead.id} выполнена. Пришлите ссылку на проект или кейс — при желании с комментарием о результате на следующей строке.`,
            [[{ text: "Добавлю позже", callback_data: `K:${lead.id}` }]],
          );
        }
        return;
      }
      case "c":
        return sendClarify(cb, lead);
    }
    return answerCallback(cb.id, "Неизвестное действие");
  }

  if (parts[0] === "R") {
    const [, id, st, idx] = parts;
    const reason = REJECT_REASONS[Number(idx)];
    const lead = LEAD_ID.test(id) ? await getLead(id) : null;
    if (!lead || !reason || !CODE_STATUS[st]) return answerCallback(cb.id, "Заявка не найдена", true);
    if (lead.status !== CODE_STATUS[st]) return refreshStale(cb, lead);
    const ok = await applyTransition(cb, lead, "rejected", reason);
    if (ok && reason === "other") {
      await setSession(cb.from.id, "reject_note", { leadId: lead.id });
      await sendMessage(chatId, `Напишите пояснение к отказу по #${lead.id}.`, [[{ text: "Без пояснения", callback_data: `K:${lead.id}` }]]);
    }
    return;
  }

  if (parts[0] === "K") {
    await clearSession(cb.from.id);
    await answerCallback(cb.id, "Хорошо");
    if (messageId) await editMessage(chatId, messageId, "Ок, можно добавить позже: /lead " + parts[1]).catch(() => undefined);
    return;
  }

  if (parts[0] === "Q") {
    const lead = LEAD_ID.test(parts[1]) ? await getLead(parts[1]) : null;
    if (!lead?.telegram_user_id) return answerCallback(cb.id, "Клиент недоступен в боте", true);
    // Защита от двойного нажатия: тот же шаблон не уходит клиенту чаще раза в минуту.
    const [recent] = await db()`
      select 1 from lead_events where lead_id = ${lead.id} and action = 'clarify_sent' and created_at > now() - interval '1 minute'
    `;
    if (recent) return answerCallback(cb.id, "Уже отправлено");
    const delivered = await deliverToClient(chatId, Number(lead.telegram_user_id), clarifyTemplate(lead));
    if (delivered) {
      await db()`insert into lead_events (lead_id, actor, action) values (${lead.id}, ${actor(cb.from.id)}, 'clarify_sent')`;
    }
    return answerCallback(cb.id, delivered ? "Отправлено клиенту" : undefined);
  }

  await answerCallback(cb.id, "Неизвестная кнопка");
}

async function refreshStale(cb: TgCallback, lead: LeadRow) {
  await answerCallback(cb.id, `Статус уже изменился: ${STATUS_LABELS[lead.status]}`, true);
  if (cb.message) await editMessage(cb.message.chat.id, cb.message.message_id, leadCardText(lead), leadKeyboard(lead));
}

async function applyTransition(cb: TgCallback, lead: LeadRow, to: LeadStatus, rejectReason?: (typeof REJECT_REASONS)[number]) {
  const result = await transitionLead(lead.id, lead.status, to, actor(cb.from.id), { rejectReason });
  if (!result.ok) {
    if (result.lead) await refreshStale(cb, result.lead);
    else await answerCallback(cb.id, "Переход недоступен", true);
    return false;
  }
  if (cb.message) await editMessage(cb.message.chat.id, cb.message.message_id, leadCardText(result.lead), leadKeyboard(result.lead));
  await answerCallback(cb.id, `Статус: ${STATUS_LABELS[to]}`);
  return true;
}

async function sendClarify(cb: TgCallback, lead: LeadRow) {
  const chatId = cb.message?.chat.id ?? cb.from.id;
  const template = clarifyTemplate(lead);
  const viaBot = Boolean(lead.telegram_user_id);
  const sent = await sendMessage(
    chatId,
    [
      `<b>Уточнение по #${lead.id}</b> · контакт: ${e(lead.contact)}`,
      "",
      `<code>${e(template)}</code>`,
      "",
      viaBot
        ? "<i>Отправьте шаблон кнопкой или ответьте на это сообщение своим текстом — он уйдёт клиенту в бот.</i>"
        : "<i>Клиент не писал боту — скопируйте текст и отправьте его по указанному контакту.</i>",
    ].join("\n"),
    viaBot ? [[{ text: "Отправить клиенту", callback_data: `Q:${lead.id}` }]] : undefined,
  );
  if (viaBot) await linkMessage(sent.message_id, Number(lead.telegram_user_id), lead.id);
  await answerCallback(cb.id);
}

async function deliverToClient(ownerChat: number, clientId: number, text: string): Promise<boolean> {
  try {
    await sendMessage(clientId, `<b>Сообщение от DavsCode</b>\n\n${e(text)}`);
    return true;
  } catch (err) {
    const reason = err instanceof TelegramError && err.code === 403 ? "клиент остановил бота" : "ошибка Telegram, попробуйте позже";
    await sendMessage(ownerChat, `Не удалось доставить сообщение: ${reason}.`);
    return false;
  }
}

/** Текстовые сообщения владельца. Возвращает false, если сообщение стоит обработать как клиентское. */
export async function handleOwnerText(msg: TgMessage): Promise<boolean> {
  const text = msg.text?.trim() ?? "";
  const chatId = msg.chat.id;
  const ownerTg = msg.from!.id;

  if (text === "/stats") {
    await sendMessage(chatId, await statsText());
    return true;
  }
  if (text === "/help" || text === "/admin") {
    await sendMessage(chatId, ADMIN_HELP);
    return true;
  }
  if (text.startsWith("/lead")) {
    const id = text.split(/\s+/)[1]?.toUpperCase() ?? "";
    const lead = LEAD_ID.test(id) ? await getLead(id) : null;
    if (!lead) await sendMessage(chatId, "Укажите номер заявки: /lead DC-000001");
    else await sendMessage(chatId, leadCardText(lead), leadKeyboard(lead));
    return true;
  }
  if (text.startsWith("/retry")) {
    const id = text.split(/\s+/)[1]?.toUpperCase();
    const count = await retryFailed(id && LEAD_ID.test(id) ? id : undefined);
    await sendMessage(chatId, count ? `Вернул в очередь заданий: ${count}.` : "Неудавшихся заданий нет.");
    return true;
  }

  // Ответ клиенту — только реплаем на связанное сообщение, чтобы не перепутать адресата.
  if (msg.reply_to_message) {
    const link = await linkedClient(msg.reply_to_message.message_id);
    if (link) {
      if (!text) {
        await sendMessage(chatId, "Можно отправить только текст.");
        return true;
      }
      const delivered = await deliverToClient(chatId, link.client, text);
      if (delivered) {
        if (link.leadId) {
          await db()`insert into lead_events (lead_id, actor, action) values (${link.leadId}, ${actor(ownerTg)}, 'message_sent')`;
        }
        await sendMessage(chatId, "✓ Отправлено клиенту");
      }
      return true;
    }
  }

  const session = await getSession(ownerTg);
  const leadId = typeof session?.data.leadId === "string" ? session.data.leadId : null;
  if (session?.state === "reject_note" && leadId && text && !text.startsWith("/")) {
    await updateLeadFields(leadId, actor(ownerTg), { reject_note: text.slice(0, 500) });
    await clearSession(ownerTg);
    await sendMessage(chatId, `Пояснение к отказу по #${leadId} сохранено.`);
    return true;
  }
  if (session?.state === "case_link" && leadId && text && !text.startsWith("/")) {
    const [first, ...rest] = text.split("\n");
    const url = /^https?:\/\/\S+$/i.test(first.trim()) ? first.trim().slice(0, 500) : null;
    const note = (url ? rest.join("\n") : text).trim().slice(0, 1000) || null;
    await updateLeadFields(leadId, actor(ownerTg), { case_url: url, result_note: note });
    await clearSession(ownerTg);
    await sendMessage(chatId, `Сохранено для #${leadId}${url ? "" : " (ссылка не распознана — сохранил как комментарий)"}.`);
    return true;
  }
  if (session && !["reject_note", "case_link"].includes(session.state)) return false;
  if (text.startsWith("/start")) return false;

  await sendMessage(chatId, ADMIN_HELP);
  return true;
}

async function statsText(): Promise<string> {
  const tz = reportTimezone();
  const [row] = await db()<Record<string, string>[]>`
    select
      count(*) filter (where created_at >= date_trunc('day', now() at time zone ${tz}) at time zone ${tz}) as today,
      count(*) filter (where created_at >= now() - interval '7 days') as week,
      count(*) filter (where status = 'new') as new,
      count(*) filter (where status = 'in_progress') as in_progress,
      count(*) filter (where status = 'rejected') as rejected,
      count(*) filter (where status = 'done') as done,
      count(*) filter (where source = 'site') as site,
      count(*) filter (where source = 'bot') as bot,
      count(*) as total
    from leads
  `;
  const failed = await db()<{ n: string }[]>`select count(*) as n from jobs where status = 'failed'`;
  return [
    "<b>Статистика заявок</b>",
    `<i>Часовой пояс: ${tz}</i>`,
    "",
    `Сегодня: ${row.today}`,
    `За 7 дней: ${row.week}`,
    `Всего: ${row.total}`,
    "",
    `Новые: ${row.new}`,
    `В работе: ${row.in_progress}`,
    `Отказы: ${row.rejected}`,
    `Выполнено: ${row.done}`,
    "",
    `Источники — сайт: ${row.site}, бот: ${row.bot}`,
    Number(failed[0].n) ? `\n⚠️ Неудавшихся заданий: ${failed[0].n} — /retry` : "",
  ].join("\n");
}
