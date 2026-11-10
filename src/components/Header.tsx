"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { nav } from "@/config/site";
import { TrackedLink } from "./Tracked";

export function Header() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="header">
      <div className="container header__inner">
        <Link href="/" className="logo" aria-label="DavsCode — на главную" onClick={() => setOpen(false)}>
          DAVS<span>/</span>CODE
        </Link>
        <nav className="nav" aria-label="Основная навигация">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="header__actions">
          <TrackedLink href="/#brief" className="btn btn--light btn--sm" event="click_cta" eventParams={{ place: "header" }} onClick={() => setOpen(false)}>
            Обсудить<span className="visually-hidden"> проект</span>
          </TrackedLink>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              {open ? (
                <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="1.5" />
              ) : (
                <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.5" />
              )}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-menu" className="mobile-menu" aria-label="Мобильная навигация">
          {nav.map((item, i) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
              <span>0{i + 1}</span>
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
