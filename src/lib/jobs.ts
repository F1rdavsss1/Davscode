import "server-only";
import { db } from "./db";
import { ownerId, reportTimezone } from "./env";
import { getLead } from "./leads";
import { upsertLeadRow, sheetsConfigured } from "./sheets";
import { sendMessage, TelegramError, escapeHtml } from "./telegram";
import { leadCardText, leadKeyboard } from "./bot/cards";

type JobRow = { id: string; lead_id: string; kind: "notify_owner" | "sync_sheet"; attempts: number; max_attempts: number };

const LOCK_SECONDS = 60;

/** Экспоненциальная задержка: 30 с, 1 мин, 2 мин … но не больше 6 часов. */
const backoffSeconds = (attempts: number) => Math.min(30 * 2 ** Math.max(0, attempts - 1), 6 * 3600);

/**
 * Забирает и выполняет готовые задания. Блокировка через FOR UPDATE SKIP LOCKED
 * и locked_until: параллельные вызовы не возьмут одно задание дважды, а задание
 * упавшей функции освободится по таймауту и будет повторено.
 */
export async function processJobs(opts: { limit?: number; leadIds?: string[] } = {}): Promise<{ done: number; failed: number }> {
  const sql = db();
  const limit = opts.limit ?? 10;
  const leadFilter = opts.leadIds?.length ? sql`and j.lead_id in ${sql(opts.leadIds)}` : sql``;

  const jobs = await sql<JobRow[]>`
    update jobs set status = 'running', attempts = attempts + 1,
                    locked_until = now() + make_interval(secs => ${LOCK_SECONDS}), updated_at = now()
    where id in (
      select j.id from jobs j
      where ((j.status = 'pending' and j.next_run_at <= now()) or (j.status = 'running' and j.locked_until < now()))
        ${leadFilter}
        and not exists (
          select 1 from jobs r where r.lead_id = j.lead_id and r.kind = j.kind and r.id <> j.id
            and r.status = 'running' and r.locked_until >= now()
        )
      order by j.next_run_at
      limit ${limit}
      for update skip locked
    )
    returning id, lead_id, kind, attempts, max_attempts
  `;

  let done = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await runJob(job);
      await sql`update jobs set status = 'done', locked_until = null, updated_at = now() where id = ${job.id}`;
      if (job.kind === "sync_sheet") await sql`update leads set sheet_synced_at = now() where id = ${job.lead_id}`;
      done++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message.slice(0, 500) : "unknown error";
      const permanent = err instanceof TelegramError && err.permanent;
      const exhausted = permanent || job.attempts >= job.max_attempts;
      const delay = err instanceof TelegramError && err.retryAfter ? err.retryAfter : backoffSeconds(job.attempts);
      // Если для заявки уже появилось новое ожидающее задание, старое не возвращаем в очередь.
      await sql`
        update jobs set
          status = case
            when ${exhausted} then 'failed'
            when exists (select 1 from jobs p where p.lead_id = ${job.lead_id} and p.kind = ${job.kind} and p.status = 'pending') then 'done'
            else 'pending' end,
          next_run_at = now() + make_interval(secs => ${delay}),
          locked_until = null, last_error = ${message}, last_error_at = now(), updated_at = now()
        where id = ${job.id}
      `;
      console.error(`[jobs] ${job.kind} ${job.lead_id} attempt ${job.attempts} failed: ${message}`);
      if (exhausted) await alertOwner(job, message);
    }
  }
  return { done, failed };
}

async function runJob(job: JobRow) {
  const lead = await getLead(job.lead_id);
  if (!lead) return;
  if (job.kind === "notify_owner") {
    const owner = ownerId();
    if (!owner) throw new Error("TELEGRAM_OWNER_ID is not set");
    await sendMessage(owner, leadCardText(lead), leadKeyboard(lead));
  } else {
    if (!sheetsConfigured()) throw new Error("Google Sheets is not configured");
    await upsertLeadRow(lead, reportTimezone());
  }
}

/** Сообщает владельцу об исчерпанных попытках. Если не работает сам Telegram — остаётся запись в логе и в таблице jobs. */
async function alertOwner(job: JobRow, message: string) {
  const owner = ownerId();
  if (!owner) return;
  const what = job.kind === "notify_owner" ? "уведомление о заявке" : "синхронизация с Google Sheets";
  try {
    await sendMessage(
      owner,
      `⚠️ Не удалось выполнить: ${what} для #${job.lead_id} (попыток: ${job.attempts}).\nОшибка: <code>${escapeHtml(message.slice(0, 300))}</code>\n\nЗаявка сохранена в базе. Повторить: /retry ${job.lead_id}`,
    );
  } catch {
    console.error(`[jobs] owner alert for ${job.lead_id} could not be delivered`);
  }
}

/** Возвращает упавшие задания заявки (или все) в очередь. */
export async function retryFailed(leadId?: string): Promise<number> {
  const sql = db();
  const rows = await sql`
    update jobs set status = 'pending', attempts = 0, next_run_at = now(), updated_at = now()
    where id in (
      select distinct on (f.lead_id, f.kind) f.id from jobs f
      where f.status = 'failed' ${leadId ? sql`and f.lead_id = ${leadId}` : sql``}
        and not exists (select 1 from jobs p where p.lead_id = f.lead_id and p.kind = f.kind and p.status = 'pending')
      order by f.lead_id, f.kind, f.id desc
    )
    returning id
  `;
  return rows.length;
}

/** Очистка служебных таблиц: старые счётчики и id обработанных апдейтов. */
export async function housekeeping() {
  const sql = db();
  await sql`delete from rate_limits where window_start < now() - interval '2 days'`;
  await sql`delete from processed_updates where created_at < now() - interval '7 days'`;
  await sql`delete from jobs where status = 'done' and updated_at < now() - interval '30 days'`;
}
