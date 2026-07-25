import type { FastifyInstance } from "fastify";
import { updateProfileSchema } from "@aispeakpro/shared";
import { db } from "../db/index.js";
import { parse } from "../http/validate.js";
import { requireUser } from "../plugins/auth.js";
import { getProfile } from "./profile.service.js";

export async function userRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: app.authenticate }, async (req) => {
    return getProfile(requireUser(req));
  });

  app.patch("/me/profile", { preHandler: app.authenticate }, async (req) => {
    const userId = requireUser(req);
    const body = parse(updateProfileSchema, req.body);
    await db
      .updateTable("learner_profiles")
      .set({
        ...(body.nativeLanguage ? { native_language: body.nativeLanguage } : {}),
        ...(body.goals ? { goals: JSON.stringify(body.goals) } : {}),
        updated_at: new Date(),
      })
      .where("user_id", "=", userId)
      .execute();
    return getProfile(userId);
  });
}
