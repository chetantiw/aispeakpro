import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { env } from "../env.js";
import { logger } from "../logger.js";

/**
 * Minimal forward-only migration runner. For an MVP a single idempotent
 * schema.sql (guarded by IF NOT EXISTS) is enough; swap for a versioned
 * migration tool (e.g. node-pg-migrate) once the schema starts evolving.
 */
async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, "schema.sql"), "utf8");
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql);
    logger.info("migration applied");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  logger.error({ err }, "migration failed");
  process.exit(1);
});
