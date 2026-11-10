import { z } from "zod";

// Единые справочники и схемы заявки — используются и формой, и сервером, и ботом.

export const PROJECT_TYPES = ["site", "bot", "automation", "other"] as const;
export const BUDGETS = ["lt20", "20_50", "50_100", "gt100", "undecided"] as const;
export const TIMELINES = ["urgent", "month", "flexible"] as const;
export const CONTACT_METHODS = ["telegram", "phone", "email"] as const;
export const STATUSES = ["new", "in_progress", "rejected", "done"] as const;
export const REJECT_REASONS = ["expensive", "not_my_profile", "changed_mind", "no_contact", "other"] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];
export type Budget = (typeof BUDGETS)[number];
export type Timeline = (typeof TIMELINES)[number];
export type ContactMethod = (typeof CONTACT_METHODS)[number];
export type LeadStatus = (typeof STATUSES)[number];
export type RejectReason = (typeof REJECT_REASONS)[number];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  site: "Сайт",
  bot: "Telegram-бот",
  automation: "Автоматизация",
  other: "Другое",
};

export const BUDGET_LABELS: Record<Budget, string> = {
  lt20: "До 20 000 ₽",
  "20_50": "20 000–50 000 ₽",
  "50_100": "50 000–100 000 ₽",
  gt100: "100 000 ₽ и выше",
  undecided: "Пока не определился",
};

export const TIMELINE_LABELS: Record<Timeline, string> = {
  urgent: "Срочно — 1–2 недели",
  month: "В течение месяца",
  flexible: "Срок не критичен",
};

export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  telegram: "Telegram",
  phone: "Телефон",
  email: "Email",
};

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  rejected: "Отказ",
  done: "Выполнено",
};

export const REJECT_REASON_LABELS: Record<RejectReason, string> = {
  expensive: "Слишком дорого",
  not_my_profile: "Не мой профиль",
  changed_mind: "Клиент передумал",
  no_contact: "Не удалось связаться",
  other: "Другое",
};

/** Версия текста согласия. Меняйте при каждом изменении текста согласия или политики. */
export const CONSENT_VERSION = "2026-10-29";

export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 2000;

const TG_USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Приводит контакт к единому виду или возвращает null, если он некорректен. */
export function normalizeContact(method: ContactMethod, raw: string): string | null {
  const value = raw.trim();
  switch (method) {
    case "telegram": {
      const name = value
        .replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i, "")
        .replace(/^@/, "")
        .replace(/\/$/, "");
      return TG_USERNAME.test(name) ? `@${name}` : null;
    }
    case "phone": {
      if (!/^\+?[\d\s()\-]+$/.test(value)) return null;
      const digits = value.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) return null;
      return value.startsWith("+") ? `+${digits}` : digits;
    }
    case "email":
      return value.length <= 200 && EMAIL.test(value) ? value.toLowerCase() : null;
  }
}

export const CONTACT_ERRORS: Record<ContactMethod, string> = {
  telegram: "Укажите имя пользователя Telegram, например @username или t.me/username",
  phone: "Укажите номер телефона, например +7 900 000-00-00",
  email: "Укажите корректный email, например name@mail.ru",
};

const touchSchema = z
  .object({
    utm_source: z.string().max(200).optional(),
    utm_medium: z.string().max(200).optional(),
    utm_campaign: z.string().max(200).optional(),
    utm_content: z.string().max(200).optional(),
    utm_term: z.string().max(200).optional(),
    landing_page: z.string().max(500).optional(),
    referrer: z.string().max(500).optional(),
    at: z.string().max(40).optional(),
  })
  .strip();

export type Touch = z.infer<typeof touchSchema>;

// Поля по шагам формы — для пошаговой проверки на клиенте.
export const stepSchemas = {
  projectType: z.enum(PROJECT_TYPES, { message: "Выберите тип проекта" }),
  description: z
    .string()
    .trim()
    .min(DESCRIPTION_MIN, { message: `Опишите задачу хотя бы в ${DESCRIPTION_MIN} символах` })
    .max(DESCRIPTION_MAX, { message: `Не больше ${DESCRIPTION_MAX} символов` }),
  budget: z.enum(BUDGETS, { message: "Выберите бюджет" }),
  timeline: z.enum(TIMELINES, { message: "Выберите сроки" }),
  name: z
    .string()
    .trim()
    .min(1, { message: "Как к вам обращаться?" })
    .max(80, { message: "Не больше 80 символов" }),
  contactMethod: z.enum(CONTACT_METHODS, { message: "Выберите способ связи" }),
  contact: z.string().trim().min(1, { message: "Укажите контакт" }).max(200),
  consent: z.literal(true, { message: "Нужно согласие на обработку персональных данных" }),
};

export const leadInputSchema = z
  .object({
    ...stepSchemas,
    idempotencyKey: z.string().regex(/^[0-9a-f-]{36}$/i, { message: "Некорректный ключ запроса" }),
    // Honeypot: обычный пользователь это поле не видит и не заполняет.
    website: z.string().max(200).optional(),
    firstTouch: touchSchema.optional(),
    lastTouch: touchSchema.optional(),
  })
  .strip()
  .transform((data, ctx) => {
    const contact = normalizeContact(data.contactMethod, data.contact);
    if (!contact) {
      ctx.addIssue({ code: "custom", path: ["contact"], message: CONTACT_ERRORS[data.contactMethod] });
      return z.NEVER;
    }
    return { ...data, contact };
  });

export type LeadInput = z.input<typeof leadInputSchema>;
export type ValidLead = z.output<typeof leadInputSchema>;

/** Плоская карта «поле → первое сообщение об ошибке». */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
