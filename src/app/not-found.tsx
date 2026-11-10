import type { Metadata } from "next";
import Link from "next/link";
import { Arrow } from "@/components/Arrow";

export const metadata: Metadata = {
  title: "Страница не найдена",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <section className="page">
      <div className="container">
        <p className="eyebrow" style={{ marginBottom: 16 }}>
          404
        </p>
        <h1 className="display">
          Такой страницы <span className="serif accent">нет.</span>
        </h1>
        <p className="lead" style={{ marginTop: 24 }}>
          Возможно, ссылка устарела. Начните с главной или посмотрите работы.
        </p>
        <div className="actions-row">
          <Link href="/" className="btn btn--light">
            На главную <Arrow />
          </Link>
          <Link href="/cases" className="btn btn--outline">
            Работы
          </Link>
        </div>
      </div>
    </section>
  );
}
