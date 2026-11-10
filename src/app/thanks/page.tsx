import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";
import { Arrow } from "@/components/Arrow";

export const metadata: Metadata = {
  title: "Заявка принята",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ id?: string | string[] }> };

export default async function ThanksPage({ searchParams }: Props) {
  const raw = (await searchParams).id;
  const id = typeof raw === "string" && /^DC-\d{6,}$/.test(raw) ? raw : null;

  return (
    <section className="page">
      <div className="container">
        <p className="eyebrow" style={{ marginBottom: 16 }}>
          Заявка принята
        </p>
        <h1 className="display">
          Спасибо<span className="serif accent">, получил.</span>
        </h1>
        {id && (
          <p className="thanks__id" aria-label={`Номер заявки ${id}`}>
            #{id}
          </p>
        )}
        <p className="lead" style={{ marginTop: id ? 0 : 24 }}>
          {site.responseNote}
          {site.telegram && ` Если вопрос срочный — напишите в Telegram @${site.telegram.username}${id ? ", указав номер заявки" : ""}.`}
        </p>
        <div className="actions-row">
          <Link href="/cases" className="btn btn--light">
            Смотреть портфолио <Arrow />
          </Link>
          {site.bot && (
            <a href={site.bot.url} className="btn btn--outline" target="_blank" rel="noopener noreferrer">
              Telegram-бот <span className="mono">@{site.bot.username}</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
