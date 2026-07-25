import type { FastifyInstance } from "fastify";
import { createSessionSchema, submitTurnSchema } from "@aispeakpro/shared";
import { parse } from "../http/validate.js";
import { requireUser } from "../plugins/auth.js";
import { assertQuota } from "./profile.service.js";
import {
  completeSession,
  getSessionDetail,
  listSessions,
  startSession,
  submitLearnerTurn,
} from "./sessions.service.js";

export async function sessionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.post("/sessions", async (req, reply) => {
    const userId = requireUser(req);
    await assertQuota(userId);
    const session = await startSession(userId, parse(createSessionSchema, req.body));
    return reply.code(201).send(session);
  });

  app.get("/sessions", async (req) => {
    return listSessions(requireUser(req));
  });

  app.get("/sessions/:id", async (req) => {
    const { id } = req.params as { id: string };
    return getSessionDetail(requireUser(req), id);
  });

  // HTTP fallback for the conversational loop (the websocket is the primary path).
  app.post("/sessions/:id/turns", async (req) => {
    const userId = requireUser(req);
    await assertQuota(userId);
    const { id } = req.params as { id: string };
    const body = parse(submitTurnSchema, req.body);
    return submitLearnerTurn(userId, id, body.text, body.pronunciation);
  });

  app.post("/sessions/:id/complete", async (req) => {
    const { id } = req.params as { id: string };
    return completeSession(requireUser(req), id);
  });
}
