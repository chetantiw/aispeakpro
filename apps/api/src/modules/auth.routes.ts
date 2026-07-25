import type { FastifyInstance } from "fastify";
import { loginSchema, refreshSchema, registerSchema } from "@aispeakpro/shared";
import { parse } from "../http/validate.js";
import { login, logout, refresh, register } from "./auth.service.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const tokens = await register(parse(registerSchema, req.body));
    return reply.code(201).send(tokens);
  });

  app.post("/login", async (req, reply) => {
    const tokens = await login(parse(loginSchema, req.body));
    return reply.send(tokens);
  });

  app.post("/refresh", async (req, reply) => {
    const { refreshToken } = parse(refreshSchema, req.body);
    return reply.send(await refresh(refreshToken));
  });

  app.post("/logout", async (req, reply) => {
    const { refreshToken } = parse(refreshSchema, req.body);
    await logout(refreshToken);
    return reply.code(204).send();
  });
}
