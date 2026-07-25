import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { wsClientMessageSchema, type WsServerMessage } from "@aispeakpro/shared";
import { verifyAccessToken } from "../auth/tokens.js";
import { AppError } from "../http/errors.js";
import { logger } from "../logger.js";
import { assertQuota } from "../modules/profile.service.js";
import { completeSession, submitLearnerTurn } from "../modules/sessions.service.js";

/**
 * Realtime conversational channel. Browsers can't set Authorization headers on
 * a WebSocket handshake, so the short-lived access token is passed as a query
 * param. This is the primary path for the tutor loop; the HTTP endpoint mirrors
 * it as a fallback. In production the STT/TTS media plane runs over WebRTC
 * (LiveKit) alongside this control channel.
 */
export async function realtimeRoutes(app: FastifyInstance) {
  app.get("/realtime/session/:id", { websocket: true }, async (socket: WebSocket, req) => {
    const send = (msg: WsServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };

    const { id: sessionId } = req.params as { id: string };
    const token = (req.query as { token?: string }).token;

    let userId: string;
    try {
      if (!token) throw new Error("missing token");
      userId = (await verifyAccessToken(token)).sub;
    } catch {
      send({ type: "error", message: "Unauthorized" });
      socket.close(1008, "unauthorized");
      return;
    }

    send({ type: "ready", sessionId });

    socket.on("message", async (raw: Buffer) => {
      let parsed;
      try {
        parsed = wsClientMessageSchema.parse(JSON.parse(raw.toString()));
      } catch {
        send({ type: "error", message: "Malformed message" });
        return;
      }

      try {
        switch (parsed.type) {
          case "ping":
            send({ type: "pong" });
            break;
          case "user_turn": {
            await assertQuota(userId);
            const { agentTurn } = await submitLearnerTurn(userId, sessionId, parsed.text);
            send({
              type: "agent_turn",
              speaker: agentTurn.speaker,
              personaId: agentTurn.personaId ?? null,
              text: agentTurn.text,
              seq: agentTurn.seq,
            });
            break;
          }
          case "end": {
            await completeSession(userId, sessionId);
            send({ type: "ended", sessionId });
            socket.close(1000, "session ended");
            break;
          }
        }
      } catch (err) {
        if (err instanceof AppError && err.code === "quota_exceeded") {
          send({ type: "quota_exceeded", message: err.message });
        } else {
          logger.error({ err, sessionId }, "ws turn failed");
          send({ type: "error", message: "Internal error" });
        }
      }
    });
  });
}
