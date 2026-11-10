import type { CoverVariant } from "@/content/cases";

/** Графические обложки концептов — сделаны вёрсткой, без тяжёлых изображений. */
export function CaseCover({ variant, label }: { variant: CoverVariant; label?: string }) {
  return (
    <div className={`cover cover--${variant}`} role="img" aria-label={COVER_ALT[variant]}>
      {variant === "flora" && <div className="cover__pin" />}
      {variant === "dent" && (
        <>
          <div className="cover__bubble">
            Запись на приём
            <br />
            Чт, 14:30 · Терапевт
          </div>
          <div className="cover__confirm">
            Подтвердить
            <br />
            запись ✓
          </div>
        </>
      )}
      {variant === "report" && (
        <>
          <div className="cover__bar" />
          <div className="cover__bar" />
          <div className="cover__bar" />
        </>
      )}
      {label && <span className="cover__label">{label}</span>}
    </div>
  );
}

const COVER_ALT: Record<CoverVariant, string> = {
  flora: "Обложка проекта Флора: метка на карте с оранжевым кругом",
  dent: "Обложка проекта Дент-бот: сообщения бота о записи на приём",
  report: "Обложка проекта Отчёт для кофейни: столбчатая диаграмма выручки",
};
