import Link from "next/link";
import { site } from "@/config/site";

export function Footer() {
  const links = [
    site.telegram && { href: site.telegram.url, label: "Telegram", external: true },
    site.bot && { href: site.bot.url, label: "Бот", external: true },
    ...site.socials.map((s) => ({ href: s.url, label: s.label, external: true })),
    { href: "/cases", label: "Портфолио", external: false },
    { href: "/privacy", label: "Политика данных", external: false },
  ].filter(Boolean) as { href: string; label: string; external: boolean }[];

  return (
    <footer className="footer">
      <div className="container footer__inner">
        <Link href="/" className="wordmark" aria-label="DavsCode — на главную">
          Davs<span className="serif">code</span>
        </Link>
        <nav className="footer__links" aria-label="Ссылки в подвале">
          {links.map((l) =>
            l.external ? (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            ) : (
              <Link key={l.label} href={l.href}>
                {l.label}
              </Link>
            ),
          )}
        </nav>
        <p className="footer__copy">© {new Date().getFullYear()} DavsCode</p>
      </div>
    </footer>
  );
}
