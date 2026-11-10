import "server-only";
import postgres from "postgres";

// Один пул на процесс. В serverless-окружении globalThis переживает горячие вызовы.
const globalForDb = globalThis as unknown as { __sql?: postgres.Sql };

export function db(): postgres.Sql {
  if (!globalForDb.__sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__sql = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX) || 3,
      // prepare: false — совместимо с пулерами в transaction mode (Neon, Supabase, PgBouncer).
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return globalForDb.__sql;
}
