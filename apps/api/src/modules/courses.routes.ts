import type { FastifyInstance } from "fastify";
import { requireUser } from "../plugins/auth.js";
import { advanceLesson, getCourseProgress, listCourses } from "./courses.service.js";

export async function courseRoutes(app: FastifyInstance) {
  app.get("/courses", async () => listCourses());

  app.get("/me/course", { preHandler: app.authenticate }, async (req) => {
    return { progress: await getCourseProgress(requireUser(req)) };
  });

  app.post("/me/course/complete", { preHandler: app.authenticate }, async (req) => {
    return { progress: await advanceLesson(requireUser(req)) };
  });
}
