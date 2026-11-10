import type { ProjectType } from "@/lib/leadSchema";

// Единый источник контактов, ссылок, услуг, цен и сроков.
// Цена null — на сайте выводится «стоимость — после брифа» вместо выдуманной цифры.

const env = (value: string | undefined) => (value && value.trim() ? value.trim() : null);

const telegramUsername = env(process.env.NEXT_PUBLIC_TELEGRAM_USERNAME)?.replace(/^@/, "") ?? null;
const botUsername = env(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)?.replace(/^@/, "") ?? null;

export const site = {
  name: "DavsCode",
  url: (env(process.env.NEXT_PUBLIC_SITE_URL) ?? "http://localhost:3000").replace(/\/$/, ""),
  locale: "ru_RU",
  year: 2026,
  description:
    "Сайты, лендинги и Telegram-боты для малого бизнеса. Помогаю получать обращения, понятно показывать услуги и убирать рутину в автоматизацию.",
  telegram: telegramUsername ? { username: telegramUsername, url: `https://t.me/${telegramUsername}` } : null,
  bot: botUsername ? { username: botUsername, url: `https://t.me/${botUsername}` } : null,
  socials: [
    { label: "Instagram", url: env(process.env.NEXT_PUBLIC_INSTAGRAM_URL) },
    { label: "TikTok", url: env(process.env.NEXT_PUBLIC_TIKTOK_URL) },
    { label: "YouTube", url: env(process.env.NEXT_PUBLIC_YOUTUBE_URL) },
  ].filter((s): s is { label: string; url: string } => Boolean(s.url)),
  responseNote: "Постараюсь ответить в течение часа в рабочее время (пн–пт, 10:00–19:00 МСК).",
};

export const nav = [
  { href: "/#services", label: "Услуги" },
  { href: "/#works", label: "Работы" },
  { href: "/#process", label: "Как работаю" },
  { href: "/#faq", label: "FAQ" },
  { href: "/#contacts", label: "Контакты" },
];

export type Service = {
  id: string;
  projectType: ProjectType;
  kicker: string;
  title: string;
  description: string;
  features: string[];
  duration: string;
  priceFrom: number | null;
  featured?: boolean;
};

export const services: Service[] = [
  {
    id: "landing",
    projectType: "site",
    kicker: "Одна страница",
    title: "Лендинг",
    description: "Одна сильная страница, которая объясняет предложение и собирает заявки.",
    features: ["Адаптивный дизайн", "Форма обратной связи", "Базовая SEO-настройка", "Подключение аналитики"],
    duration: "5–7 дней",
    priceFrom: null,
  },
  {
    id: "business-site",
    projectType: "site",
    kicker: "Многостраничный",
    title: "Сайт для бизнеса",
    description: "Представительство компании с услугами, каталогом и заявками.",
    features: ["Страницы услуг и компании", "Каталог или портфолио", "Формы заявок", "SEO-метаданные", "Интеграции по согласованию"],
    duration: "7–10 дней",
    priceFrom: null,
  },
  {
    id: "telegram-bot",
    projectType: "bot",
    kicker: "Telegram",
    title: "Telegram-бот",
    description: "Принимает заявки, отвечает клиентам и сразу сообщает владельцу.",
    features: ["Сценарии диалога", "Приём и обработка заявок", "Уведомления владельцу", "Таблицы и API", "Хранение состояния диалогов"],
    duration: "5–10 дней",
    priceFrom: null,
    featured: true,
  },
  {
    id: "automation",
    projectType: "automation",
    kicker: "Процессы",
    title: "Автоматизация",
    description: "Связываю сервисы между собой и убираю повторяющуюся ручную работу.",
    features: ["Интеграция сервисов", "Сбор и обработка данных", "Уведомления и отчёты", "Индивидуальная логика"],
    duration: "по объёму",
    priceFrom: null,
  },
];

export function formatPrice(price: number | null): string {
  if (price === null) return "цена после брифа";
  return `от ${new Intl.NumberFormat("ru-RU").format(price)} ₽`;
}
