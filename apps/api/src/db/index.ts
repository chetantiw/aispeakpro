import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { env } from "../env.js";
import type { Database } from "./types.js";

// A single shared pool per process. In production this sits behind PgBouncer
// (transaction pooling) so thousands of API instances share a bounded pool.
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.NODE_ENV === "production" ? 20 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export async function closeDb(): Promise<void> {
  await db.destroy();
}

export type DB = typeof db;
