import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { sql } from "kysely";
import type { ApiError } from "@aispeakpro/shared";
import { env } from "./env.js";
import { loggerOptions } from "./logger.js";
import { db } from "./db/index.js";
import { AppError } from "./http/errors.js";
import { authPlugin } from "./plugins/auth.js";
import { getRedisConnection } from "./queue.js";
import { authRoutes } from "./modules/auth.routes.js";
import { userRoutes } from "./modules/users.routes.js";
import { scenarioRoutes } from "./modules/scenarios.routes.js";
import { sessionRoutes } from "./modules/sessions.routes.js";
import { vocabRoutes } from "./modules/vocab.routes.js";
import { realtimeRoutes } from "./realtime/ws.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions, trustProxy: true });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(websocket);
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    redis: getRedisConnection() ?? undefined,
    allowList: (req) => req.url === "/health" || req.url === "/ready",
  });

  await app.register(authPlugin);

  // Uniform error envelope.
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      const body: ApiError = {
        error: { code: error.code, message: error.message, details: error.details },
      };
      return reply.code(error.statusCode).send(body);
    }
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply
        .code(429)
        .send({ error: { code: "rate_limited", message: "Too many requests" } });
    }
    req.log.error({ err: error }, "unhandled error");
    return reply
      .code(500)
      .send({ error: { code: "internal_error", message: "Something went wrong" } });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: { code: "not_found", message: "Route not found" } });
  });

  // Liveness / readiness.
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (_req, reply) => {
    try {
      await sql`select 1`.execute(db);
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "degraded" });
    }
  });

  // Versioned API surface.
  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: "/auth" });
      await v1.register(userRoutes);
      await v1.register(scenarioRoutes);
      await v1.register(sessionRoutes);
      await v1.register(vocabRoutes);
      await v1.register(realtimeRoutes);
    },
    { prefix: "/v1" },
  );

  return app;
}
