import type { FastifyInstance } from "fastify";
import { reviewGradeSchema, type VocabItem } from "@aispeakpro/shared";
import { db } from "../db/index.js";
import { Errors } from "../http/errors.js";
import { parse } from "../http/validate.js";
import { requireUser } from "../plugins/auth.js";
import { scheduleReview } from "../pedagogy/srs.js";

function toVocabDto(row: {
  id: string;
  term: string;
  definition: string;
  due_at: Date;
  repetitions: number;
  interval_days: number;
  ease: number;
}): VocabItem {
  return {
    id: row.id,
    term: row.term,
    definition: row.definition,
    dueAt: new Date(row.due_at).toISOString(),
    repetitions: row.repetitions,
    intervalDays: row.interval_days,
    ease: row.ease,
  };
}

export async function vocabRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/vocab/due", async (req) => {
    const userId = requireUser(req);
    const rows = await db
      .selectFrom("vocabulary_items")
      .selectAll()
      .where("user_id", "=", userId)
      .where("due_at", "<=", new Date())
      .orderBy("due_at", "asc")
      .limit(50)
      .execute();
    return rows.map(toVocabDto);
  });

  app.post("/vocab/:id/review", async (req) => {
    const userId = requireUser(req);
    const { id } = req.params as { id: string };
    const { grade } = parse(reviewGradeSchema, req.body);

    const item = await db
      .selectFrom("vocabulary_items")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!item || item.user_id !== userId) throw Errors.notFound("Vocab item not found");

    const next = scheduleReview(
      { ease: item.ease, intervalDays: item.interval_days, repetitions: item.repetitions },
      grade,
    );

    const updated = await db
      .updateTable("vocabulary_items")
      .set({
        ease: next.ease,
        interval_days: next.intervalDays,
        repetitions: next.repetitions,
        due_at: next.dueAt,
        last_reviewed_at: new Date(),
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return toVocabDto(updated);
  });
}
