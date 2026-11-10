import "server-only";
import { ownerId } from "../env";
import { answerCallback, sendMessage } from "../telegram";
import { handleOwnerCallback, handleOwnerText } from "./admin";
import { casesScreen, faqScreen, screenForStart, servicesScreen } from "./catalog";
import { handleClientCallback, handleClientText, showMenu, showScreen, startBrief, startQuestion } from "./client";
import { clearSession } from "./session";
import type { TgUpdate } from "./types";

// Префиксы callback_data административных кнопок.
const ADMIN_PREFIXES = ["L:", "R:", "K:", "Q:DC-"];

export async function handleUpdate(update: TgUpdate): Promise<void> {
  const owner = ownerId();

  if (update.callback_query) {
    const cb = update.callback_query;
    if (cb.from.is_bot) return;
    const data = cb.data ?? "";
    if (ADMIN_PREFIXES.some((p) => data.startsWith(p))) {
      // Права проверяются на сервере при каждом действии, а не скрытием кнопок.
      if (cb.from.id !== owner) return void (await answerCallback(cb.id, "Нет доступа", true));
      return handleOwnerCallback(cb);
    }
    const result = await handleClientCallback(cb);
    await answerCallback(cb.id, result === false ? "Кнопка устарела" : result || undefined);
    return;
  }

  const msg = update.message;
  if (!msg?.from || msg.from.is_bot || msg.chat.type !== "private") return;
  const text = msg.text?.trim() ?? "";

  if (msg.from.id === owner && (await handleOwnerText(msg))) return;

  if (text === "/start" || text.startsWith("/start ")) {
    await clearSession(msg.from.id);
    // Ссылки с сайта: t.me/<бот>?start=services | cases | faq | case_<slug> | brief
    const payload = text.slice("/start".length).trim();
    if (payload === "brief") return startBrief(msg.chat.id, msg.from.id);
    const screen = payload ? screenForStart(payload) : null;
    return screen ? showScreen(msg.chat.id, screen) : showMenu(msg.chat.id);
  }
  if (text === "/services") return showScreen(msg.chat.id, servicesScreen());
  if (text === "/cases") return showScreen(msg.chat.id, casesScreen());
  if (text === "/faq") return showScreen(msg.chat.id, faqScreen());
  if (text === "/brief") return startBrief(msg.chat.id, msg.from.id);
  if (text === "/ask") return startQuestion(msg.chat.id, msg.from.id);
  if (text === "/stop" || text === "/cancel") {
    await clearSession(msg.from.id);
    return void (await sendMessage(msg.chat.id, "Готово, диалог завершён. Меню — /start"));
  }
  if (await handleClientText(msg)) return;
  await showMenu(msg.chat.id);
}
