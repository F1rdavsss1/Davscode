import { after, NextResponse } from "next/server";
import { site } from "@/config/site";
import { fieldErrors, leadInputSchema } from "@/lib/leadSchema";
import { createLead, findLeadByKey } from "@/lib/leads";
import { processJobs } from "@/lib/jobs";
import { clientIp, hashIdentifier, hit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

type ErrorCode = "BAD_ORIGIN" | "BAD_REQUEST" | "TOO_LARGE" | "VALIDATION_ERROR" | "RATE_LIMITED" | "UNAVAILABLE";

function fail(code: ErrorCode, message: string, status: number, fields?: Record<string, string>) {
  return NextResponse.json({ ok: false, code, message, ...(fields ? { fields } : {}) }, { status });
}

function allowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const allowed = new Set([new URL(site.url).origin]);
  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://127.0.0.1:3000");
  }
  // Превью-деплои Vercel проверяем по собственному адресу деплоя.
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`);
  return allowed.has(origin);
}

export async function POST(req: Request) {
  if (!allowedOrigin(req.headers.get("origin"))) {
    return fail("BAD_ORIGIN", "Запрос отклонён.", 403);
  }
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("BAD_REQUEST", "Некорректный запрос.", 415);
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return fail("TOO_LARGE", "Слишком большой запрос.", 413);
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return fail("TOO_LARGE", "Слишком большой запрос.", 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("BAD_REQUEST", "Некорректный запрос.", 400);
  }

  const parsed = leadInputSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Проверьте поля формы.", 422, fieldErrors(parsed.error));
  }
  const input = parsed.data;

  // Honeypot заполнен — это бот. Отвечаем нейтрально и ничего не сохраняем.
  if (input.website) return NextResponse.json({ ok: true, id: null, status: "accepted", message: "Заявка принята." });

  try {
    // Повтор того же запроса (тайм-аут, двойное нажатие) возвращает уже созданную заявку и не тратит лимит.
    const existing = await findLeadByKey(input.idempotencyKey);
    if (existing) {
      return NextResponse.json({ ok: true, id: existing.id, status: "accepted", message: "Заявка принята." });
    }

    const limit = Number(process.env.LEAD_RATE_LIMIT_PER_HOUR) || 5;
    if (!(await hit(`lead:${hashIdentifier(clientIp(req.headers))}`, limit, 3600))) {
      return fail("RATE_LIMITED", "Слишком много заявок за короткое время. Попробуйте позже или напишите в Telegram.", 429);
    }

    const { lead } = await createLead({
      idempotencyKey: input.idempotencyKey,
      source: "site",
      projectType: input.projectType,
      description: input.description,
      budget: input.budget,
      timeline: input.timeline,
      name: input.name,
      contactMethod: input.contactMethod,
      contact: input.contact,
      firstTouch: input.firstTouch,
      lastTouch: input.lastTouch,
    });

    // Уведомление и синхронизация — после ответа клиенту. Сбой здесь не теряет заявку:
    // состояние уведомления хранится в строке заявки, повтор — по cron или при следующем обращении к боту.
    after(() => processJobs({ leadIds: [lead.id] }).catch((err) => console.error("[lead] jobs:", err)));

    return NextResponse.json({ ok: true, id: lead.id, status: "accepted", message: "Заявка принята." }, { status: 201 });
  } catch (err) {
    console.error("[lead] save failed:", err instanceof Error ? err.message : "unknown");
    return fail("UNAVAILABLE", "Не удалось сохранить заявку. Данные формы сохранены — попробуйте отправить ещё раз через минуту.", 503);
  }
}

export function GET() {
  return NextResponse.json({ ok: false, code: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { allow: "POST" } });
}
