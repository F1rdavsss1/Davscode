// Регистрирует вебхук бота и список команд. Запуск: npm run telegram:webhook
// Нужны TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET и NEXT_PUBLIC_SITE_URL (https).
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, NEXT_PUBLIC_SITE_URL: siteUrl } = process.env;
if (!token || !secret || !siteUrl?.startsWith("https://")) {
  console.error("Нужны TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET и NEXT_PUBLIC_SITE_URL с https://");
  process.exit(1);
}

async function call(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

const url = `${siteUrl.replace(/\/$/, "")}/api/telegram/webhook`;
await call("setWebhook", {
  url,
  secret_token: secret,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: false,
});
await call("setMyCommands", {
  commands: [
    { command: "start", description: "Меню" },
    { command: "services", description: "Услуги и цены" },
    { command: "cases", description: "Портфолио" },
    { command: "faq", description: "Вопросы и ответы" },
    { command: "brief", description: "Оставить заявку" },
    { command: "ask", description: "Задать вопрос" },
    { command: "stop", description: "Завершить диалог" },
  ],
});
const owner = Number(process.env.TELEGRAM_OWNER_ID);
if (owner) {
  // Команды владельца видны только в его чате.
  await call("setMyCommands", {
    scope: { type: "chat", chat_id: owner },
    commands: [
      { command: "stats", description: "Статистика заявок" },
      { command: "lead", description: "Открыть заявку: /lead DC-000001" },
      { command: "retry", description: "Повторить неотправленные уведомления" },
      { command: "help", description: "Команды владельца" },
      { command: "start", description: "Клиентское меню" },
    ],
  });
}
const info = await call("getWebhookInfo", {});
console.log(`Webhook: ${info.url}\nPending updates: ${info.pending_update_count}${info.last_error_message ? `\nLast error: ${info.last_error_message}` : ""}`);
