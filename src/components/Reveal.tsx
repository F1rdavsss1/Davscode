"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Плавное появление блоков при прокрутке (ТЗ 3.5): CSS + IntersectionObserver, без библиотек.
 * Блоки с атрибутом data-reveal скрываются только после того, как этот скрипт
 * добавил класс js-reveal, поэтому без JS контент виден сразу.
 */
export function Reveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    const items = document.querySelectorAll("[data-reveal]:not(.is-visible)");
    items.forEach((el) => {
      // Уже видимое на экране показываем сразу, без анимации «из ниоткуда».
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add("is-visible");
      else io.observe(el);
    });
    document.documentElement.classList.add("js-reveal");
    return () => io.disconnect();
  }, [pathname]);

  return null;
}
