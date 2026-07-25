import type { CefrProfile } from "@aispeakpro/shared";
import { db } from "../db/index.js";
import { env } from "../env.js";
import { getLLM } from "../providers/index.js";
import { generateFeedback } from "../pedagogy/feedback.js";
import { logger } from "../logger.js";

export interface FeedbackJobData {
  sessionId: string;
  userId: string;
}

/**
 * Post-session pedagogy pipeline (runs async off the hot path):
 *  1. mine errors + strengths from the learner's utterances
 *  2. persist a feedback report
 *  3. fold recurring errors back into the learner model
 *  4. enqueue newly-seen vocabulary into the spaced-repetition system
 */
export async function processFeedback(data: FeedbackJobData): Promise<void> {
  const { sessionId, userId } = data;

  const turns = await db
    .selectFrom("turns")
    .select("text")
    .where("session_id", "=", sessionId)
    .where("speaker", "=", "learner")
    .orderBy("seq", "asc")
    .execute();
  const learnerTexts = turns.map((t) => t.text);

  const profileRow = await db
    .selectFrom("learner_profiles")
    .select(["speaking_cefr", "listening_cefr", "vocabulary_cefr", "grammar_cefr"])
    .where("user_id", "=", userId)
    .executeTakeFirst();

  const cefr: CefrProfile = {
    speaking: (profileRow?.speaking_cefr ?? "A1") as CefrProfile["speaking"],
    listening: (profileRow?.listening_cefr ?? "A1") as CefrProfile["listening"],
    vocabulary: (profileRow?.vocabulary_cefr ?? "A1") as CefrProfile["vocabulary"],
    grammar: (profileRow?.grammar_cefr ?? "A1") as CefrProfile["grammar"],
  };

  const fb = await generateFeedback(learnerTexts, cefr, getLLM(), env.LLM_PROVIDER === "openai");

  await db
    .insertInto("session_feedback")
    .values({
      session_id: sessionId,
      summary: fb.summary,
      cefr_estimate: JSON.stringify(fb.cefrEstimate),
      strengths: JSON.stringify(fb.strengths),
      focus_areas: JSON.stringify(fb.focusAreas),
    })
    .onConflict((oc) =>
      oc.column("session_id").doUpdateSet({
        summary: fb.summary,
        cefr_estimate: JSON.stringify(fb.cefrEstimate),
        strengths: JSON.stringify(fb.strengths),
        focus_areas: JSON.stringify(fb.focusAreas),
      }),
    )
    .execute();

  // Fold errors back into the learner model (increment if already known).
  for (const err of fb.errors) {
    const existing = await db
      .selectFrom("learner_errors")
      .select(["id", "times_seen"])
      .where("user_id", "=", userId)
      .where("category", "=", err.category)
      .where("example", "=", err.example)
      .executeTakeFirst();
    if (existing) {
      await db
        .updateTable("learner_errors")
        .set({ times_seen: existing.times_seen + 1, last_seen_at: new Date() })
        .where("id", "=", existing.id)
        .execute();
    } else {
      await db
        .insertInto("learner_errors")
        .values({
          user_id: userId,
          category: err.category,
          example: err.example,
          correction: err.correction,
          severity: err.severity,
        })
        .execute();
    }
  }

  // Seed new vocabulary into the SRS (due immediately; ignore duplicates).
  for (const term of fb.newVocabulary) {
    await db
      .insertInto("vocabulary_items")
      .values({ user_id: userId, term, definition: "" })
      .onConflict((oc) => oc.columns(["user_id", "term"]).doNothing())
      .execute();
  }

  logger.info({ sessionId, errors: fb.errors.length, vocab: fb.newVocabulary.length }, "feedback processed");
}
