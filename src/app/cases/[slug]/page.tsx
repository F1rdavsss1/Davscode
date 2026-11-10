import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CASE_KIND_LABELS, cases, getCase } from "@/content/cases";
import { CaseCover } from "@/components/CaseCover";
import { TrackedLink } from "@/components/Tracked";
import { Arrow } from "@/components/Arrow";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return cases.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = getCase((await params).slug);
  if (!item) return {};
  const title = `${item.title} — ${item.name.toLowerCase()}`;
  return {
    title,
    description: item.summary,
    alternates: { canonical: `/cases/${item.slug}` },
    openGraph: { title: `${title} — DavsCode`, description: item.summary, url: `/cases/${item.slug}`, type: "article" },
  };
}

export default async function CasePage({ params }: Props) {
  const item = getCase((await params).slug);
  if (!item) notFound();
  const others = cases.filter((c) => c.slug !== item.slug).slice(0, 3);

  const blocks = [
    { n: "01", title: "Задача", text: item.problem },
    { n: "02", title: "Аудитория", text: item.audience },
    { n: "03", title: "Решение", text: item.solution },
  ];

  return (
    <article className="case">
      <div className="container case__narrow">
        <Link href="/cases" className="back-link">
          <Arrow direction="left" /> Работы
        </Link>

        <div className="case__tags">
          <span className="chip">{CASE_KIND_LABELS[item.kind]}</span>
          {item.concept && <span className="chip chip--solid">Концепт · не реальный заказ</span>}
        </div>
        <h1 className="display">
          {item.title}
          <span className="accent">.</span>
        </h1>
        <p className="case__summary">{item.summary}</p>

        <div className="case__cover">
          <CaseCover variant={item.cover} label="Обложка проекта" />
        </div>

        <dl className="case__meta">
          {[
            ["Тип", item.meta.type],
            ["Срок", item.meta.duration],
            ["Аудитория", item.meta.audience],
            ["Год", String(item.meta.year)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="eyebrow">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        <div className="case__blocks">
          {blocks.map((b) => (
            <section key={b.n} className="case__block">
              <span className="case__block-num" aria-hidden="true">
                {b.n}
              </span>
              <div>
                <h2>{b.title}</h2>
                <p>{b.text}</p>
              </div>
            </section>
          ))}
        </div>

        <blockquote className="case__quote serif">{item.quote}</blockquote>

        <section className="case__section" aria-labelledby="features-title">
          <h2 id="features-title" className="eyebrow">
            04 — Функции
          </h2>
          <ul className="feature-list">
            {item.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <ul className="stack" aria-label="Технологии">
            {item.stack.map((s) => (
              <li key={s} className="chip">
                {s}
              </li>
            ))}
          </ul>
        </section>

        <section className="case__section" aria-labelledby="screens-title">
          <h2 id="screens-title" className="eyebrow">
            05 — Экраны
          </h2>
          <div className="screens">
            {item.screens.map((s, i) => (
              <figure key={s.caption} className="screen">
                <figcaption>
                  [Скриншот {i + 1}] {s.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="case__section case__result" aria-labelledby="result-title">
          <h2 id="result-title" className="eyebrow">
            06 — Результат и выводы
          </h2>
          <p>{item.result}</p>
          <p>Ограничения: {item.limitations}</p>
        </section>

        <div className="similar">
          <h2>
            Нужно <span className="serif">похожее?</span>
          </h2>
          <TrackedLink href="/#brief" className="btn btn--dark" event="click_cta" eventParams={{ place: "case", slug: item.slug }}>
            Хочу похожий проект <Arrow />
          </TrackedLink>
        </div>

        <section aria-labelledby="others-title">
          <h2 id="others-title" className="eyebrow" style={{ marginBottom: 16 }}>
            Другие работы
          </h2>
          <nav className="other-works">
            {others.map((o) => (
              <TrackedLink key={o.slug} href={`/cases/${o.slug}`} event="click_project" eventParams={{ slug: o.slug }}>
                <span>
                  <strong>{o.title}</strong>
                  <span className="muted small">
                    {CASE_KIND_LABELS[o.kind]}
                    {o.concept ? " · Концепт" : ""}
                  </span>
                </span>
                <Arrow direction="up-right" />
              </TrackedLink>
            ))}
          </nav>
        </section>
      </div>
    </article>
  );
}
