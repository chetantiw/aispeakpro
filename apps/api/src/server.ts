import { buildApp } from "./app.js";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { closeDb } from "./db/index.js";

async function main() {
  const app = await buildApp();
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  logger.info(`API listening on :${env.API_PORT}`);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "failed to start");
  process.exit(1);
});
