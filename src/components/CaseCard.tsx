import { CASE_KIND_LABELS, type CaseStudy } from "@/content/cases";
import { CaseCover } from "./CaseCover";
import { TrackedLink } from "./Tracked";
import { Arrow } from "./Arrow";

export function CaseCard({ item, headingLevel = "h3" }: { item: CaseStudy; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  const href = `/cases/${item.slug}`;
  return (
    <article className="work">
      <TrackedLink href={href} className="work__cover" event="click_project" eventParams={{ slug: item.slug }} tabIndex={-1} aria-hidden="true">
        <CaseCover variant={item.cover} />
      </TrackedLink>
      <div className="work__tag eyebrow">
        {CASE_KIND_LABELS[item.kind]} {item.concept && <span>· Концепт</span>}
      </div>
      <Heading className="h3">
        <TrackedLink href={href} event="click_project" eventParams={{ slug: item.slug }}>
          {item.title} — {item.name.charAt(0).toLowerCase() + item.name.slice(1)}
        </TrackedLink>
      </Heading>
      <p>
        <strong>Задача:</strong> {item.task} <strong>Сделано:</strong> {item.done}
      </p>
      <TrackedLink href={href} className="work__open" event="click_project" eventParams={{ slug: item.slug }}>
        Открыть кейс <Arrow />
        <span className="visually-hidden"> «{item.title}»</span>
      </TrackedLink>
    </article>
  );
}
