import type { Metadata } from "next";
import { cases } from "@/content/cases";
import { CaseCard } from "@/components/CaseCard";

export const metadata: Metadata = {
  title: "Работы",
  description: "Проекты DavsCode: лендинги, сайты, Telegram-боты и автоматизация для малого бизнеса.",
  alternates: { canonical: "/cases" },
  openGraph: { title: "Работы — DavsCode", url: "/cases" },
};

export default function CasesPage() {
  return (
    <section className="page">
      <div className="container">
        <div className="section__head">
          <p className="eyebrow">/cases</p>
          <h1 className="h2">
            Все <span className="serif accent">работы</span>
          </h1>
          <p className="section__aside">
            Работы с меткой «Концепт» — демонстрационные, не коммерческие заказы. Для них описана реализованная функциональность, а не
            бизнес-показатели.
          </p>
        </div>
        <div className="works">
          {cases.map((c) => (
            <CaseCard key={c.slug} item={c} headingLevel="h2" />
          ))}
        </div>
      </div>
    </section>
  );
}
