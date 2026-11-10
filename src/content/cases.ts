// Кейсы портфолио. Демонстрационные работы обязательно помечаются concept: true —
// на сайте они подписываются как «Концепт · не реальный заказ».
// Для концептов не указываем выдуманных метрик: только реализованную функциональность.

export type CaseKind = "site" | "bot" | "automation";
export type CoverVariant = "flora" | "dent" | "report";

export type CaseStudy = {
  slug: string;
  kind: CaseKind;
  concept: boolean;
  title: string;
  name: string;
  summary: string;
  task: string;
  done: string;
  cover: CoverVariant;
  meta: { type: string; duration: string; audience: string; year: number };
  problem: string;
  audience: string;
  solution: string;
  quote: string;
  features: string[];
  stack: string[];
  screens: { caption: string }[];
  result: string;
  limitations: string;
};

export const CASE_KIND_LABELS: Record<CaseKind, string> = {
  site: "Сайт",
  bot: "Бот",
  automation: "Автоматизация",
};

export const cases: CaseStudy[] = [
  {
    slug: "flora",
    kind: "site",
    concept: true,
    title: "Флора",
    name: "Лендинг цветочного магазина",
    summary: "Лендинг цветочного магазина, который принимает заказы букетов без звонков.",
    task: "принимать заказы букетов без звонков.",
    done: "каталог, форма заказа, уведомления в Telegram.",
    cover: "flora",
    meta: { type: "Лендинг", duration: "7 дней", audience: "Жители района", year: 2026 },
    problem:
      "Магазин принимает заказы только по телефону. Флорист отвлекается от работы, часть вечерних звонков теряется.",
    audience: "Люди, которые заказывают букет с телефона — часто в последний момент и на ходу.",
    solution:
      "Короткий лендинг с витриной букетов и формой в три поля. Заказ сразу приходит флористу в Telegram.",
    quote: "Заказ за минуту — без звонка и ожидания.",
    features: [
      "Витрина букетов с ценами",
      "Форма заказа: букет, адрес, время",
      "Уведомление флористу в Telegram",
      "Запись заказов в Google Sheets",
    ],
    stack: ["Next.js", "TypeScript", "Bot API", "Sheets API", "Vercel"],
    screens: [{ caption: "Витрина букетов" }, { caption: "Форма заказа" }],
    result:
      "Концепт: измеримых бизнес-результатов нет. Реализован полный путь заказа — от витрины до уведомления флористу.",
    limitations: "Нет онлайн-оплаты, каталог обновляется вручную.",
  },
  {
    slug: "dent-bot",
    kind: "bot",
    concept: true,
    title: "Дент-бот",
    name: "Бот записи в стоматологию",
    summary: "Telegram-бот, который записывает пациентов к врачу и напоминает о приёме.",
    task: "разгрузить администратора.",
    done: "выбор услуги и времени, напоминания, заявки в таблицу.",
    cover: "dent",
    meta: { type: "Telegram-бот", duration: "8 дней", audience: "Пациенты клиники", year: 2026 },
    problem:
      "Администратор клиники весь день отвечает на однотипные вопросы и вручную записывает пациентов, пока у стойки ждут люди.",
    audience: "Пациенты, которым удобнее записаться в мессенджере, чем дозваниваться в рабочее время.",
    solution:
      "Бот предлагает услугу, врача и свободное время, подтверждает запись и напоминает о приёме накануне. Записи попадают в таблицу клиники.",
    quote: "Запись в три нажатия — даже ночью.",
    features: [
      "Выбор услуги, врача и времени",
      "Подтверждение и отмена записи",
      "Напоминание за день до приёма",
      "Таблица записей для администратора",
    ],
    stack: ["Node.js", "TypeScript", "Bot API", "PostgreSQL", "Sheets API"],
    screens: [{ caption: "Выбор времени" }, { caption: "Подтверждение записи" }],
    result:
      "Концепт: измеримых бизнес-результатов нет. Реализован сценарий записи с напоминаниями и выгрузкой в таблицу.",
    limitations: "Нет синхронизации с медицинской информационной системой, расписание врачей ведётся в таблице.",
  },
  {
    slug: "coffee-report",
    kind: "automation",
    concept: true,
    title: "Отчёт для кофейни",
    name: "Ежедневный отчёт для кофейни",
    summary: "Автоматический вечерний отчёт о выручке кофейни в Telegram.",
    task: "видеть выручку без ручных сводок.",
    done: "сбор данных из таблицы, отчёт в Telegram каждый вечер.",
    cover: "report",
    meta: { type: "Автоматизация", duration: "5 дней", audience: "Владелец и управляющий", year: 2026 },
    problem:
      "Владелец каждый вечер просит у бариста фото кассового отчёта и сводит цифры вручную.",
    audience: "Владелец и управляющий, которые следят за точкой с телефона.",
    solution:
      "Скрипт по расписанию забирает данные смены из таблицы, считает выручку, средний чек и сравнение с прошлой неделей и отправляет короткий отчёт в Telegram.",
    quote: "Цифры дня приходят сами — в 22:00.",
    features: [
      "Сбор данных смены из Google Sheets",
      "Расчёт выручки и среднего чека",
      "Сравнение с прошлой неделей",
      "Отчёт в Telegram по расписанию",
    ],
    stack: ["TypeScript", "Sheets API", "Bot API", "Cron"],
    screens: [{ caption: "Отчёт в Telegram" }, { caption: "Таблица смен" }],
    result:
      "Концепт: измеримых бизнес-результатов нет. Реализован ежедневный отчёт без ручной сводки.",
    limitations: "Данные вносятся в таблицу вручную, прямой интеграции с кассой нет.",
  },
];

export function getCase(slug: string): CaseStudy | undefined {
  return cases.find((c) => c.slug === slug);
}
