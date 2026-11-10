"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { getAttribution } from "@/lib/attribution";
import {
  BUDGETS,
  BUDGET_LABELS,
  CONTACT_ERRORS,
  CONTACT_METHODS,
  CONTACT_METHOD_LABELS,
  DESCRIPTION_MAX,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  TIMELINES,
  TIMELINE_LABELS,
  normalizeContact,
  stepSchemas,
  type ContactMethod,
  type ProjectType,
} from "@/lib/leadSchema";
import { BRIEF_PRESET_EVENT } from "./Tracked";
import { Arrow } from "./Arrow";

type Values = {
  projectType: string;
  description: string;
  budget: string;
  timeline: string;
  name: string;
  contactMethod: ContactMethod;
  contact: string;
  consent: boolean;
  website: string;
};

type Errors = Partial<Record<keyof Values | "form", string>>;

const INITIAL: Values = {
  projectType: "",
  description: "",
  budget: "",
  timeline: "",
  name: "",
  contactMethod: "telegram",
  contact: "",
  consent: false,
  website: "",
};

const STEPS = [
  { label: "Тип проекта", title: ["Что будем", "делать?"] },
  { label: "Задача", title: ["Какую задачу", "решаем?"] },
  { label: "Бюджет", title: ["На какой", "бюджет?"] },
  { label: "Сроки", title: ["Когда нужен", "результат?"] },
  { label: "Контакты", title: ["Как с вами", "связаться?"] },
] as const;

const PLACEHOLDERS: Record<ProjectType, string> = {
  site: "Например: лендинг для стоматологии с онлайн-записью и уведомлениями о заявках в Telegram.",
  bot: "Например: бот для салона красоты — запись к мастеру, напоминания клиентам, заявки в таблицу.",
  automation: "Например: каждый вечер собирать выручку из таблицы и присылать отчёт в Telegram.",
  other: "Опишите, что нужно разработать и какую задачу должен решать проект.",
};

const CONTACT_PLACEHOLDERS: Record<ContactMethod, string> = {
  telegram: "@username",
  phone: "+7 900 000-00-00",
  email: "name@mail.ru",
};

const DRAFT_KEY = "dc_brief_draft";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
      );
}

function validateStep(step: number, v: Values): Errors {
  const errors: Errors = {};
  const check = <K extends keyof typeof stepSchemas>(field: K, value: unknown) => {
    const r = stepSchemas[field].safeParse(value);
    if (!r.success) errors[field as keyof Values] = r.error.issues[0].message;
  };
  if (step === 0) check("projectType", v.projectType);
  if (step === 1) check("description", v.description);
  if (step === 2) check("budget", v.budget);
  if (step === 3) check("timeline", v.timeline);
  if (step === 4) {
    check("name", v.name);
    check("contact", v.contact);
    if (!errors.contact && !normalizeContact(v.contactMethod, v.contact)) errors.contact = CONTACT_ERRORS[v.contactMethod];
    check("consent", v.consent);
  }
  return errors;
}

const STEP_FIELDS: (keyof Values)[][] = [["projectType"], ["description"], ["budget"], ["timeline"], ["name", "contactMethod", "contact", "consent"]];

export function BriefForm({ botUrl }: { botUrl: string | null }) {
  const router = useRouter();
  const formId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [moved, setMoved] = useState(false);
  // Ключ идемпотентности живёт до успешной отправки: повтор после тайм-аута не создаст дубликат.
  const keyRef = useRef<string>("");

  // Черновик в sessionStorage — данные не теряются при перезагрузке или ошибке сервера.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as { values: Values; step: number; key: string };
        setValues({ ...INITIAL, ...draft.values, consent: false, website: "" });
        setStep(Math.min(Math.max(0, draft.step), STEPS.length - 1));
        keyRef.current = draft.key;
      }
    } catch {
      // Нет доступа к хранилищу — работаем без черновика.
    }
    if (!keyRef.current) keyRef.current = newKey();
  }, []);

  useEffect(() => {
    if (!started) return;
    try {
      const { consent: _c, website: _w, ...rest } = values;
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ values: rest, step, key: keyRef.current }));
    } catch {
      // ignore
    }
  }, [values, step, started]);

  // Предвыбор типа проекта по кнопкам «Обсудить» в карточках услуг.
  useEffect(() => {
    const onPreset = (e: Event) => {
      const type = (e as CustomEvent<ProjectType>).detail;
      if (!(PROJECT_TYPES as readonly string[]).includes(type)) return;
      setValues((v) => ({ ...v, projectType: type }));
    };
    window.addEventListener(BRIEF_PRESET_EVENT, onPreset);
    return () => window.removeEventListener(BRIEF_PRESET_EVENT, onPreset);
  }, []);

  useEffect(() => {
    if (moved) titleRef.current?.focus();
  }, [step, moved]);

  const set = <K extends keyof Values>(field: K, value: Values[K]) => {
    if (!started) {
      setStarted(true);
      track("form_start");
    }
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const goNext = () => {
    const stepErrors = validateStep(step, values);
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      return;
    }
    track("form_step_complete", { step: step + 1 });
    setErrors({});
    setMoved(true);
    setStep((s) => s + 1);
  };

  const goBack = () => {
    setErrors({});
    setMoved(true);
    setStep((s) => Math.max(0, s - 1));
  };

  const submit = async () => {
    if (submitting) return;
    // Перед отправкой перепроверяем все шаги: вдруг что-то сбросилось.
    for (let i = 0; i < STEPS.length; i++) {
      const stepErrors = validateStep(i, values);
      if (Object.keys(stepErrors).length) {
        setErrors(stepErrors);
        setStep(i);
        return;
      }
    }
    setSubmitting(true);
    setErrors({});
    track("form_submit");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, idempotencyKey: keyRef.current, ...getAttribution() }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true; id: string | null }
        | { ok: false; code: string; message: string; fields?: Record<string, string> }
        | null;
      if (res.ok && data?.ok) {
        track("lead_success", { source: "site" });
        try {
          sessionStorage.removeItem(DRAFT_KEY);
        } catch {
          // ignore
        }
        router.push(data.id ? `/thanks?id=${encodeURIComponent(data.id)}` : "/thanks");
        return;
      }
      track("lead_error", { code: data && !data.ok ? data.code : `HTTP_${res.status}` });
      if (data && !data.ok && data.fields) {
        const fieldErrors = data.fields as Errors;
        setErrors({ ...fieldErrors, form: data.message });
        const firstStep = STEP_FIELDS.findIndex((fields) => fields.some((f) => fieldErrors[f]));
        if (firstStep >= 0) setStep(firstStep);
      } else {
        setErrors({ form: data && !data.ok ? data.message : "Не удалось отправить заявку. Проверьте соединение и попробуйте ещё раз." });
      }
    } catch {
      track("lead_error", { code: "NETWORK" });
      setErrors({ form: "Нет соединения с сервером. Данные сохранены — попробуйте отправить ещё раз." });
    } finally {
      setSubmitting(false);
    }
  };

  const progress = Math.round(((step + 1) / STEPS.length) * 100);
  const isLast = step === STEPS.length - 1;
  const errId = (f: string) => `${formId}-${f}-error`;
  const errorText = (field: keyof Values) =>
    errors[field] ? (
      <p className="field-error" id={errId(field)} role="alert">
        {errors[field]}
      </p>
    ) : null;

  const radioGroup = (field: "projectType" | "budget" | "timeline", options: readonly string[], labels: Record<string, string>, single = false) => (
    <fieldset className={`options${single ? " options--single" : ""}`} aria-describedby={errors[field] ? errId(field) : undefined}>
      <legend className="visually-hidden">{STEPS[step].label}</legend>
      {options.map((option, i) => (
        <label key={option} className="option">
          <input type="radio" name={`${formId}-${field}`} value={option} checked={values[field] === option} onChange={() => set(field, option)} />
          <span>{labels[option]}</span>
          <span className="option__num" aria-hidden="true">
            {String(i + 1).padStart(2, "0")}
          </span>
        </label>
      ))}
    </fieldset>
  );

  return (
    <form
      className="brief"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (isLast) void submit();
        else goNext();
      }}
    >
      <div className="brief__progress" aria-hidden="true">
        <span>
          Шаг {step + 1} / {STEPS.length} · {STEPS[step].label}
        </span>
        <span>{progress}%</span>
      </div>
      <div
        className="brief__bar"
        role="progressbar"
        aria-label="Прогресс заполнения брифа"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-valuetext={`Шаг ${step + 1} из ${STEPS.length}: ${STEPS[step].label}`}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      <h3 className="brief__title" tabIndex={-1} ref={titleRef}>
        {STEPS[step].title[0]} <span className="serif accent">{STEPS[step].title[1]}</span>
      </h3>

      {step === 0 && (
        <>
          {radioGroup("projectType", PROJECT_TYPES, PROJECT_TYPE_LABELS)}
          {errorText("projectType")}
        </>
      )}

      {step === 1 && (
        <div className="field">
          <label htmlFor={`${formId}-description`}>Описание задачи</label>
          <textarea
            id={`${formId}-description`}
            className="input"
            value={values.description}
            maxLength={DESCRIPTION_MAX}
            placeholder={PLACEHOLDERS[(values.projectType as ProjectType) || "other"]}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={`${formId}-description-hint${errors.description ? ` ${errId("description")}` : ""}`}
            onChange={(e) => set("description", e.target.value)}
          />
          <div className="field__row" id={`${formId}-description-hint`}>
            <span>Опишите, что нужно разработать и какую задачу должен решать проект.</span>
            <span className="field__counter">
              {values.description.trim().length} / {DESCRIPTION_MAX}
            </span>
          </div>
          {errorText("description")}
        </div>
      )}

      {step === 2 && (
        <>
          {radioGroup("budget", BUDGETS, BUDGET_LABELS, true)}
          {errorText("budget")}
        </>
      )}

      {step === 3 && (
        <>
          {radioGroup("timeline", TIMELINES, TIMELINE_LABELS, true)}
          {errorText("timeline")}
        </>
      )}

      {step === 4 && (
        <>
          <div className="field">
            <label htmlFor={`${formId}-name`}>Имя</label>
            <input
              id={`${formId}-name`}
              className="input"
              autoComplete="given-name"
              value={values.name}
              maxLength={80}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? errId("name") : undefined}
              onChange={(e) => set("name", e.target.value)}
            />
            {errorText("name")}
          </div>
          <fieldset className="field">
            <legend>Способ связи</legend>
            <div className="segmented">
              {CONTACT_METHODS.map((m) => (
                <label key={m} className="option">
                  <input
                    type="radio"
                    name={`${formId}-method`}
                    value={m}
                    checked={values.contactMethod === m}
                    onChange={() => {
                      set("contactMethod", m);
                      setErrors((e) => ({ ...e, contact: undefined }));
                    }}
                  />
                  <span>{CONTACT_METHOD_LABELS[m]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor={`${formId}-contact`}>{CONTACT_METHOD_LABELS[values.contactMethod]}</label>
            <input
              id={`${formId}-contact`}
              className="input"
              type={values.contactMethod === "email" ? "email" : values.contactMethod === "phone" ? "tel" : "text"}
              inputMode={values.contactMethod === "phone" ? "tel" : values.contactMethod === "email" ? "email" : "text"}
              autoComplete={values.contactMethod === "email" ? "email" : values.contactMethod === "phone" ? "tel" : "off"}
              placeholder={CONTACT_PLACEHOLDERS[values.contactMethod]}
              value={values.contact}
              maxLength={200}
              aria-invalid={Boolean(errors.contact)}
              aria-describedby={errors.contact ? errId("contact") : undefined}
              onChange={(e) => set("contact", e.target.value)}
            />
            {errorText("contact")}
          </div>
          <div className="hp-field" aria-hidden="true">
            <label htmlFor={`${formId}-website`}>Сайт компании</label>
            <input id={`${formId}-website`} tabIndex={-1} autoComplete="off" value={values.website} onChange={(e) => set("website", e.target.value)} />
          </div>
          <div className="field">
            <label className="checkbox" htmlFor={`${formId}-consent`}>
              <input
                id={`${formId}-consent`}
                type="checkbox"
                checked={values.consent}
                aria-invalid={Boolean(errors.consent)}
                aria-describedby={errors.consent ? errId("consent") : undefined}
                onChange={(e) => set("consent", e.target.checked)}
              />
              <span>
                Даю согласие на обработку персональных данных в соответствии с{" "}
                <Link href="/privacy" target="_blank">
                  политикой обработки данных
                </Link>
              </span>
            </label>
            {errorText("consent")}
          </div>
        </>
      )}

      {errors.form && (
        <div className="brief__alert" role="alert">
          {errors.form}
        </div>
      )}

      <div className="brief__nav">
        {step > 0 && (
          <button type="button" className="btn btn--outline" onClick={goBack} disabled={submitting}>
            <Arrow direction="left" /> Назад
          </button>
        )}
        <button type="submit" className={`btn ${isLast ? "btn--accent" : "btn--light"}`} disabled={submitting} aria-busy={submitting}>
          {isLast ? (submitting ? "Отправляю…" : "Отправить заявку") : "Продолжить"}
          <Arrow />
        </button>
      </div>

      {botUrl && (
        <p className="brief__alt">
          или{" "}
          <a href={botUrl} target="_blank" rel="noopener noreferrer" onClick={() => track("click_telegram", { place: "brief" })}>
            оставить заявку в Telegram-боте
          </a>
        </p>
      )}
    </form>
  );
}
