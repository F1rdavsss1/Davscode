import type { Touch } from "./leadSchema";

// Атрибуция: первый источник хранится в localStorage (на 90 дней),
// последний — в sessionStorage и обновляется при каждом заходе с UTM-метками.

const FIRST_KEY = "dc_first_touch";
const LAST_KEY = "dc_last_touch";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const FIRST_TTL_MS = 90 * 24 * 3600 * 1000;

function read(storage: Storage, key: string): Touch | undefined {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as Touch) : undefined;
  } catch {
    return undefined;
  }
}

function write(storage: Storage, key: string, value: Touch) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Хранилище недоступно (приватный режим) — заявка уйдёт без меток.
  }
}

const cut = (s: string, n = 200) => s.slice(0, n);

export function captureAttribution() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const touch: Touch = { at: new Date().toISOString() };
  let hasUtm = false;
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) {
      touch[key] = cut(value);
      hasUtm = true;
    }
  }
  touch.landing_page = cut(window.location.pathname, 500);
  const externalReferrer = document.referrer && !document.referrer.startsWith(window.location.origin);
  if (externalReferrer) touch.referrer = cut(document.referrer, 500);

  const first = read(localStorage, FIRST_KEY);
  const firstExpired = first?.at ? Date.now() - Date.parse(first.at) > FIRST_TTL_MS : true;
  if (!first || firstExpired) write(localStorage, FIRST_KEY, touch);
  if (hasUtm || externalReferrer || !read(sessionStorage, LAST_KEY)) write(sessionStorage, LAST_KEY, touch);
}

export function getAttribution(): { firstTouch?: Touch; lastTouch?: Touch } {
  if (typeof window === "undefined") return {};
  return { firstTouch: read(localStorage, FIRST_KEY), lastTouch: read(sessionStorage, LAST_KEY) };
}
