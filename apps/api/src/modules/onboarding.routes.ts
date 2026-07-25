import type { FastifyInstance } from "fastify";
import { onboardingSchema } from "@aispeakpro/shared";
import { parse } from "../http/validate.js";
import { requireUser } from "../plugins/auth.js";
import { submitOnboarding } from "./onboarding.service.js";

export async function onboardingRoutes(app: FastifyInstance) {
  app.post("/onboarding", { preHandler: app.authenticate }, async (req) => {
    const userId = requireUser(req);
    return submitOnboarding(userId, parse(onboardingSchema, req.body));
  });
}
