import type { Metadata } from "next";
import { faq } from "@/content/faq";
import { cases } from "@/content/cases";
import { formatPrice, services, site } from "@/config/site";
import { BriefForm } from "@/components/BriefForm";
import { CaseCard } from "@/components/CaseCard";
import { TrackedLink, TrackPageView } from "@/components/Tracked";
import { Arrow } from "@/components/Arrow";

export const metadata: Metadata = {
  title: { absolute: "DavsCode — сайты и Telegram-боты для малого бизнеса за 5–10 дней" },
  description: site.description,
  alternates: { canonical: "/" },
  openGraph: { title: "DavsCode — сайты и Telegram-боты для малого бизнеса", description: site.description, url: "/" },
};

const marquee = ["Лендинги", "Сайты для бизнеса", "Telegram-боты", "Автоматизация", "Интеграции"];

const steps = [
  { n: "I", title: "Заявка", text: "Вы описываете задачу и оставляете контакт." },
  { n: "II", title: "Бриф и предложение", text: "Уточняю требования, называю объём, срок и стоимость." },
  { n: "III", title: "Прототип и разработка", text: "Согласуем структуру и ключевые решения, затем делаю." },
  { n: "IV", title: "Запуск и поддержка", text: "Проверяем, передаю проект, обсуждаем сопровождение." },
];

export default function HomePage() {
  const sameAs = [site.telegram?.url, ...site.socials.map((s) => s.url)].filter(Boolean);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfessionalService",
        name: "DavsCode",
        url: site.url,
        description: site.description,
        areaServed: "RU",
        ...(sameAs.length ? { sameAs } : {}),
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <>
      <TrackPageView event="view_home" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* 00 — Первый экран */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero__grid">
          <div>
            <div className="hero__eyebrow eyebrow">
              <span>00 — Независимый разработчик</span>
              <span>RU / {site.year}</span>
            </div>
            <h1 id="hero-title" className="display">
              Сайты и Telegram‑боты для малого бизнеса <span className="serif accent nowrap">за 5–10 дней*</span>
            </h1>
            <p className="lead">Помогаю бизнесу получать обращения, понятно показывать услуги и убирать рутину в автоматизацию.</p>
            <div className="hero__ctas">
              <TrackedLink href="#brief" className="btn btn--light" event="click_cta" eventParams={{ place: "hero" }}>
                Обсудить проект <Arrow />
              </TrackedLink>
              <TrackedLink href="#works" className="btn btn--outline" event="click_cta" eventParams={{ place: "hero_works" }}>
                Смотреть работы
              </TrackedLink>
            </div>
            <p className="hero__note">* Ориентир для типовых проектов. Точный срок — после брифа.</p>
          </div>

          <div>
            <div className="hero-visual" aria-hidden="true">
              <div className="hero-visual__rule" />
              <p className="hero-visual__motto serif">
                форма
                <br />
                следует
                <br />
                заявке
              </p>
              <div className="hero-visual__sun" />
              <div className="hero-visual__ticket">
                <b>
                  <span>
                    <span className="status-dot" />
                    Новая заявка
                  </span>
                  <span>#DC-000047</span>
                </b>
                Тип: Сайт
                <br />
                Бюджет: 20–50 тыс ₽
                <br />
                Статус: Новая
              </div>
            </div>
            <ul className="hero-index" aria-label="Специализации">
              {["Лендинги", "Сайты для бизнеса", "Telegram-боты", "Автоматизация"].map((s, i) => (
                <li key={s}>
                  {s}
                  <span>0{i + 1}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee__track">
          {[0, 1].map((copy) => (
            <div className="marquee__group" key={copy}>
              {[...marquee, ...marquee].flatMap((item, i) => [<span key={`t${i}`}>{item}</span>, <i key={`x${i}`}>✕</i>])}
            </div>
          ))}
        </div>
      </div>

      {/* 01 — Услуги */}
      <section id="services" data-reveal className="section" aria-labelledby="services-title">
        <div className="container">
          <div className="section__head">
            <p className="eyebrow">01 — Услуги</p>
            <h2 id="services-title" className="h2">
              Четыре формата <span className="serif accent">без лишнего</span>
            </h2>
            <p className="section__aside">Сложные интеграции и дополнительные требования оцениваются отдельно.</p>
          </div>
          <div className="services">
            {services.map((s, i) => (
              <article key={s.id} className={`service${s.featured ? " service--featured" : ""}`}>
                <div className="service__top">
                  <span className="service__num">0{i + 1}</span>
                  <span className="service__kicker">{s.kicker}</span>
                </div>
                <h3 className="h3">{s.title}</h3>
                <p className="service__desc">{s.description}</p>
                <ul className="service__features">
                  {s.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <div className="service__meta">
                  <span>[{s.duration}]</span>
                  <span className="service__price">{formatPrice(s.priceFrom)}</span>
                </div>
                <TrackedLink
                  href="#brief"
                  className={`btn btn--sm btn--block ${s.featured ? "btn--dark" : "btn--outline"}`}
                  event="click_cta"
                  eventParams={{ place: "service", service: s.id }}
                  presetType={s.projectType}
                >
                  <span>
                    Обсудить проект<span className="visually-hidden">: {s.title}</span>
                  </span>
                  <Arrow />
                </TrackedLink>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 02 — Работы */}
      <section id="works" data-reveal className="section section--flush-top" aria-labelledby="works-title">
        <div className="container">
          <div className="section__head">
            <p className="eyebrow">02 — Работы</p>
            <h2 id="works-title" className="h2">
              Избранные <span className="serif accent">проекты</span>
            </h2>
            <div className="section__aside">
              <p>Работы с меткой «Концепт» — демонстрационные, не коммерческие заказы.</p>
              <TrackedLink href="/cases" className="section__link" event="click_cta" eventParams={{ place: "all_works" }}>
                Все работы <Arrow />
              </TrackedLink>
            </div>
          </div>
          <div className="works">
            {cases.slice(0, 9).map((c) => (
              <CaseCard key={c.slug} item={c} />
            ))}
          </div>
        </div>
      </section>

      {/* 03 — Как работаю */}
      <section id="process" data-reveal className="section section--deep" aria-labelledby="process-title">
        <div className="container">
          <div className="section__head">
            <p className="eyebrow">03 — Как работаю</p>
            <h2 id="process-title" className="h2">
              Четыре шага <span className="serif accent">до запуска</span>
            </h2>
          </div>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.n} className="step">
                <div className="step__num" aria-hidden="true">
                  {s.n}
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="steps-note">Сроки зависят от объёма, готовности материалов и скорости обратной связи.</p>
        </div>
      </section>

      {/* 04 — FAQ */}
      <section id="faq" data-reveal className="section" aria-labelledby="faq-title">
        <div className="container faq">
          <div className="stack-head">
            <p className="eyebrow">04 — FAQ</p>
            <h2 id="faq-title" className="h2">
              Вопросы
            </h2>
          </div>
          <div className="faq__list">
            {faq.map((f, i) => (
              <details key={f.q} open={i === 0}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 05 — Заявка */}
      <section id="brief" className="section section--deep" aria-labelledby="brief-title">
        <div className="container brief-wrap">
          <div className="stack-head">
            <p className="eyebrow">05 — Заявка</p>
            <h2 id="brief-title" className="h2">
              Расскажите <span className="serif accent">о задаче</span>
            </h2>
            <p className="muted">Пять коротких шагов — около минуты.</p>
            <p className="muted small">{site.responseNote}</p>
          </div>
          <BriefForm botUrl={site.bot?.url ?? null} />
        </div>
      </section>

      {/* Контакты */}
      <section id="contacts" data-reveal className="cta-final" aria-labelledby="cta-title">
        <div className="container cta-final__grid">
          <h2 id="cta-title" className="h2">
            Есть задача? <span className="serif accent">обсудим.</span>
          </h2>
          <div className="cta-final__actions">
            <TrackedLink href="#brief" className="btn btn--accent" event="click_cta" eventParams={{ place: "final" }}>
              Заполнить бриф <Arrow />
            </TrackedLink>
            {site.telegram && (
              <TrackedLink
                href={site.telegram.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--outline"
                event="click_telegram"
                eventParams={{ place: "final" }}
              >
                Написать в Telegram <span className="mono">@{site.telegram.username}</span>
              </TrackedLink>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
