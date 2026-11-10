import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { housekeeping, processJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Повторная обработка незавершённых заданий. Вызывается Vercel Cron или внешним планировщиком. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const result = await processJobs({ limit: 50 });
  await housekeeping();
  return NextResponse.json({ ok: true, ...result });
}
