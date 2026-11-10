// Локальная проверка бота без деплоя и без https.
// Забирает апдейты у Telegram (getUpdates) и пересылает их в локальный вебхук
// http://localhost:3000/api/telegram/webhook с секретным заголовком — так же, как это делает Telegram.
//
// Запуск (в отдельном терминале, пока работает `npm run dev`):  npm run bot:dev
// Если у бота уже установлен production-вебхук, скрипт остановится: getUpdates с ним несовместим.
// Снять вебхук ради локальной проверки:  npm run bot:dev -- --drop-webhook
// (после проверки верните его: npm run telegram:webhook)
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const local = process.env.BOT_DEV_TARGET || "http://localhost:3000/api/telegram/webhook";
if (!token || !secret) {
  console.error("Нужны TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET в .env.local");
  process.exit(1);
}

const api = async (method, payload = {}) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
};

const me = await api("getMe");
const hook = await api("getWebhookInfo");
if (hook.url) {
  if (!process.argv.includes("--drop-webhook")) {
    console.error(`У бота установлен вебхук ${hook.url}.\nЛокальная проверка его отключит. Запустите с --drop-webhook, если это не рабочий бот с клиентами.`);
    process.exit(1);
  }
  await api("deleteWebhook", { drop_pending_updates: false });
  console.log("Вебхук снят. После проверки верните: npm run telegram:webhook");
}

console.log(`Слушаю @${me.username} → ${local}\nНапишите боту /start. Остановить — Ctrl+C.\n`);

let offset = 0;
for (;;) {
  let updates = [];
  try {
    updates = await api("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
  } catch (err) {
    console.error("getUpdates:", err.message);
    await new Promise((r) => setTimeout(r, 3000));
    continue;
  }
  for (const u of updates) {
    offset = u.update_id + 1;
    const what = u.message?.text ?? (u.callback_query ? `[кнопка ${u.callback_query.data}]` : "[другое]");
    const who = (u.message ?? u.callback_query)?.from;
    try {
      const res = await fetch(local, {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
        body: JSON.stringify(u),
      });
      console.log(`${res.status} · ${who?.id ?? "?"} · ${what.slice(0, 60)}`);
    } catch (err) {
      console.error(`Локальный сервер недоступен (${err.message}). Запущен ли npm run dev?`);
    }
  }
}
