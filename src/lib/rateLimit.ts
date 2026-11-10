import "server-only";
import { createHmac } from "node:crypto";
import { kvIncrement } from "./kv";

/**
 * Счётчик в фиксированном окне, общий для всех serverless-вызовов (хранится на листе «Служебное»).
 * Возвращает true, если лимит ещё не превышен (и засчитывает попытку).
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const count = await kvIncrement(`rate:${key}:${window}`, windowSeconds * 2);
  return count <= limit;
}

/** IP не храним в открытом виде — только HMAC. */
export function hashIdentifier(value: string): string {
  const secret = process.env.IP_HASH_SECRET || "davscode-dev-secret";
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
}

/**
 * IP клиента берём только из заголовка, который выставляет доверенная инфраструктура
 * (на Vercel — x-real-ip). Произвольный X-Forwarded-For от клиента не используется.
 */
export function clientIp(headers: Headers): string {
  const header = process.env.TRUSTED_IP_HEADER || (process.env.VERCEL ? "x-real-ip" : "");
  if (!header) return "unknown";
  const value = headers.get(header);
  return value?.split(",")[0]?.trim() || "unknown";
}
