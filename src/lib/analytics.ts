// Отправка целей в Яндекс Метрику. В параметры никогда не передаются
// имена, контакты, тексты заявок и другие персональные данные.

export type AnalyticsEvent =
  | "view_home"
  | "click_project"
  | "click_cta"
  | "form_start"
  | "form_step_complete"
  | "form_submit"
  | "lead_success"
  | "lead_error"
  | "click_telegram";

type Params = Record<string, string | number | boolean>;

declare global {
  interface Window {
    ym?: (id: number, method: string, ...args: unknown[]) => void;
  }
}

export function track(event: AnalyticsEvent, params?: Params) {
  if (typeof window === "undefined") return;
  const id = Number(process.env.NEXT_PUBLIC_YM_ID);
  if (!id || !window.ym) return;
  try {
    window.ym(id, "reachGoal", event, params);
  } catch {
    // Аналитика не должна ломать интерфейс.
  }
}
