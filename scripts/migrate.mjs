// Применяет db/schema.sql к базе из DATABASE_URL. Запуск: npm run db:migrate
// Переменные берутся из окружения или из .env.local / .env.
import { readFileSync, existsSync } from "node:fs";
import postgres from "postgres";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, onnotice: () => {} });
try {
  await sql.unsafe(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  console.log("Schema applied.");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
