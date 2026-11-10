import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { handleUpdate } from "@/lib/bot/handler";
import { markUpdateProcessed } from "@/lib/bot/session";
import type { TgUpdate } from "@/lib/bot/types";
import { processJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

function validSecret(received: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!validSecret(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (typeof update?.update_id !== "number") return NextResponse.json({ ok: true });

  try {
    if (await markUpdateProcessed(update.update_id)) await handleUpdate(update);
  } catch (err) {
    // Отвечаем 200, чтобы Telegram не повторял апдейт бесконечно; ошибку видно в логах.
    console.error("[webhook] update failed:", err instanceof Error ? err.message : err);
  }
  // Заодно доставляем задания, созданные этим апдейтом (заявка из бота, смена статуса).
  after(() => processJobs({ limit: 5 }).catch((err) => console.error("[webhook] jobs:", err)));
  return NextResponse.json({ ok: true });
}
