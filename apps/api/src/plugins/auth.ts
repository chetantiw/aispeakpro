import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { verifyAccessToken } from "../auth/tokens.js";
import { Errors } from "../http/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Adds `request.userId` and an `authenticate` preHandler. Bearer-token auth;
 * stateless, so any API instance can serve any request (horizontal scaling).
 */
export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest("userId", null);

  app.decorate("authenticate", async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw Errors.unauthorized();
    const token = header.slice("Bearer ".length);
    try {
      const claims = await verifyAccessToken(token);
      req.userId = claims.sub;
    } catch {
      throw Errors.unauthorized("Invalid or expired token");
    }
  });
});

/** Convenience for handlers: assert and narrow the authed user id. */
export function requireUser(req: FastifyRequest): string {
  if (!req.userId) throw Errors.unauthorized();
  return req.userId;
}
