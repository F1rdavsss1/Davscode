"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Arrow } from "./Arrow";
import { TrackedLink } from "./Tracked";

/**
 * Закреплённая снизу кнопка «Обсудить проект» на мобильных (ТЗ 3.6).
 * Прячется, когда на экране уже есть форма-бриф или финальный блок с кнопками,
 * чтобы не перекрывать поля ввода.
 */
export function MobileCta() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const targets = ["brief", "contacts"].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (targets.length === 0 || !("IntersectionObserver" in window)) return;
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      setHidden(visible.size > 0);
    });
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [pathname]);

  // На служебных страницах кнопка не нужна.
  if (pathname === "/thanks" || pathname === "/privacy") return null;

  return (
    <div className="mobile-cta" data-hidden={hidden} aria-hidden={hidden}>
      <TrackedLink
        href="/#brief"
        className="btn btn--accent"
        event="click_cta"
        eventParams={{ place: "mobile_sticky" }}
        tabIndex={hidden ? -1 : undefined}
      >
        Обсудить проект <Arrow />
      </TrackedLink>
    </div>
  );
}
