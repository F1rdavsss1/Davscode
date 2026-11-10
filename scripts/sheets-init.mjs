// Готовит Google-таблицу — сейчас она основное хранилище заявок:
//   «Заявки»     — одна строка на заявку, колонка U скрыта (служебные данные);
//   «Аналитика»  — формулы;
//   «Журнал»     — скрытый, история действий;
//   «Служебное»  — скрытый, состояние бота и лимиты.
// Запуск: npm run sheets:init (нужны GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY).
// Безопасно запускать повторно: существующие строки не трогаются, «Аналитика» перезаписывается.
import { createSign } from "node:crypto";
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const { GOOGLE_SHEETS_ID: sheetId, GOOGLE_SERVICE_ACCOUNT_EMAIL: email } = process.env;
const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!sheetId || !email || !key) {
  console.error("Нужны GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL и GOOGLE_PRIVATE_KEY");
  process.exit(1);
}

const LEADS = "Заявки";
const ANALYTICS = "Аналитика";
const LOG = "Журнал";
const KV = "Служебное";
const LOG_HEADERS = ["Дата", "ID заявки", "Кто", "Действие", "Из статуса", "В статус", "Детали"];
const KV_HEADERS = ["Ключ", "Значение", "Истекает (unix ms)"];
const HEADERS = [
  "ID", "Дата создания", "Источник", "Тип проекта", "Задача", "Бюджет", "Срок", "Имя", "Контакт", "Статус",
  "Причина отказа", "Ссылка на кейс", "Заметки", "UTM Source", "UTM Medium", "UTM Campaign", "UTM Content", "UTM Term",
  "Дата последнего изменения", "Состояние синхронизации", "Служебные данные (не редактировать)",
];

const b64 = (s) => Buffer.from(s).toString("base64url");
async function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
  });
  if (!res.ok) throw new Error(`OAuth: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const accessToken = await token();
async function api(path, method = "GET", body) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

// 1. Листы
const meta = await api("?fields=sheets.properties");
const existing = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
const hiddenSheets = new Set([LOG, KV]);
const add = [LEADS, ANALYTICS, LOG, KV]
  .filter((t) => !existing.has(t))
  .map((title) => ({ addSheet: { properties: { title, hidden: hiddenSheets.has(title), gridProperties: { frozenRowCount: 1 } } } }));
if (add.length) {
  const res = await api(":batchUpdate", "POST", { requests: add });
  for (const r of res.replies) existing.set(r.addSheet.properties.title, r.addSheet.properties.sheetId);
}

// 2. Заголовки «Заявки», закреплённая строка, защита системных колонок (кроме «Заметки») предупреждением
const range = (sheet, a1) => encodeURIComponent(`'${sheet}'!${a1}`);
await api(`/values/${range(LEADS, "A1:U1")}?valueInputOption=RAW`, "PUT", { values: [HEADERS] });
await api(`/values/${range(LOG, "A1:G1")}?valueInputOption=RAW`, "PUT", { values: [LOG_HEADERS] });
await api(`/values/${range(KV, "A1:C1")}?valueInputOption=RAW`, "PUT", { values: [KV_HEADERS] });
const leadsId = existing.get(LEADS);
await api(":batchUpdate", "POST", {
  requests: [
    { updateSheetProperties: { properties: { sheetId: leadsId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { repeatCell: { range: { sheetId: leadsId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId: leadsId, startColumnIndex: 0, endColumnIndex: 12 },
          description: "Заполняется системой. Статусы меняйте через Telegram-бота — правки здесь будут перезаписаны при следующем изменении заявки.",
          warningOnly: true,
        },
      },
    },
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId: leadsId, startColumnIndex: 13, endColumnIndex: 21 },
          description: "Заполняется системой. Колонка U — копия заявки, по которой система её читает: не редактируйте и не удаляйте.",
          warningOnly: true,
        },
      },
    },
    // Колонка U (служебный JSON) скрыта, чтобы не мешать.
    { updateDimensionProperties: { range: { sheetId: leadsId, dimension: "COLUMNS", startIndex: 20, endIndex: 21 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
  ],
}).catch((err) => console.warn("Не удалось применить оформление/защиту (возможно, уже есть):", err.message));

// 3. «Аналитика»
const L = (col) => `'${LEADS}'!${col}2:${col}`;
const rows = [["Показатель", "Значение", "Как считается"]];
const push = (label, formula, note = "") => {
  rows.push([label, formula, note]);
  return rows.length; // номер строки
};
const curMonth = push("Текущий месяц", `=TEXT(TODAY();"yyyy-mm")`);
const prevMonth = push("Предыдущий месяц", `=TEXT(EDATE(TODAY();-1);"yyyy-mm")`);
push("Заявок за текущий месяц", `=COUNTIF(${L("B")};B${curMonth}&"*")`, "По дате создания");
push("Заявок за предыдущий месяц", `=COUNTIF(${L("B")};B${prevMonth}&"*")`, "По дате создания");
const total = push("Всего заявок", `=COUNTA(${L("A")})`, "Знаменатель для конверсий ниже");
rows.push(["", "", ""]);
for (const s of ["Новая", "В работе", "Отказ", "Выполнено"]) push(`Статус: ${s}`, `=COUNTIF(${L("J")};"${s}")`);
rows.push(["", "", ""]);
push(
  "Дошли до работы, %",
  `=IFERROR(ROUND((COUNTIF(${L("J")};"В работе")+COUNTIF(${L("J")};"Выполнено"))/B${total}*100;1);0)`,
  "(В работе + Выполнено) / все заявки. Отказы после взятия в работу сюда не входят — полная история на скрытом листе «Журнал»",
);
push("Завершены, %", `=IFERROR(ROUND(COUNTIF(${L("J")};"Выполнено")/B${total}*100;1);0)`, "Выполнено / все заявки");
rows.push(["", "", ""]);
for (const r of ["Слишком дорого", "Не мой профиль", "Клиент передумал", "Не удалось связаться", "Другое"]) {
  push(`Отказ: ${r}`, `=COUNTIF(${L("K")};"${r}*")`);
}
rows.push(["", "", ""]);
for (const t of ["Сайт", "Telegram-бот", "Автоматизация", "Другое"]) push(`Тип: ${t}`, `=COUNTIF(${L("D")};"${t}")`);
rows.push(["", "", ""]);
push("Источник: Сайт", `=COUNTIF(${L("C")};"Сайт")`);
push("Источник: Бот", `=COUNTIF(${L("C")};"Бот")`);
push("UTM source заполнен", `=COUNTA(${L("N")})`, "Детализация — фильтром по колонке N на листе «Заявки»");
rows.push(["", "", ""]);
const undecided = `COUNTIF(${L("F")};"Пока не определился")`;
push(
  "Средний бюджет (оценка), ₽",
  `=IFERROR(ROUND((COUNTIF(${L("F")};"До 20 000 ₽")*10000+COUNTIF(${L("F")};"20 000–50 000 ₽")*35000+COUNTIF(${L("F")};"50 000–100 000 ₽")*75000+COUNTIF(${L("F")};"100 000 ₽ и выше")*100000)/(B${total}-${undecided});-3);"")`,
  "Оценка по серединам диапазонов: 10 / 35 / 75 тыс.; «100 000 и выше» = 100 тыс. (нижняя граница). Только заявки с определённым бюджетом",
);
push("Без определённого бюджета, %", `=IFERROR(ROUND(${undecided}/B${total}*100;1);0)`);

// Разделитель аргументов в API всегда запятая, поэтому меняем «;» на «,».
const values = rows.map((r) => r.map((c) => (typeof c === "string" && c.startsWith("=") ? c.replaceAll(";", ",") : c)));
await api(`/values/${range(ANALYTICS, "A:C")}:clear`, "POST", {});
await api(`/values/${range(ANALYTICS, `A1:C${values.length}`)}?valueInputOption=USER_ENTERED`, "PUT", { values });

console.log(`Готово: листы «${LEADS}», «${ANALYTICS}», «${LOG}», «${KV}» настроены.`);
