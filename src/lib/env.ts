import "server-only";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const reportTimezone = () => process.env.REPORT_TIMEZONE || "Europe/Moscow";

export function ownerId(): number | null {
  const raw = process.env.TELEGRAM_OWNER_ID;
  const id = raw ? Number(raw) : NaN;
  return Number.isSafeInteger(id) ? id : null;
}
