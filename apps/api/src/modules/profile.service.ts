import type { CefrProfile, Profile } from "@aispeakpro/shared";
import { db } from "../db/index.js";
import { env } from "../env.js";
import { Errors } from "../http/errors.js";
import type { LearnerContext } from "../pedagogy/promptBuilder.js";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Load the learner profile, lazily resetting the daily free-minute counter. */
export async function getProfile(userId: string): Promise<Profile> {
  const row = await db
    .selectFrom("learner_profiles")
    .innerJoin("users", "users.id", "learner_profiles.user_id")
    .selectAll("learner_profiles")
    .select("users.email as email")
    .where("learner_profiles.user_id", "=", userId)
    .executeTakeFirst();

  if (!row) throw Errors.notFound("Profile not found");

  let minutesUsedToday = row.minutes_used_today;
  const resetAt = new Date(row.minutes_reset_at).toISOString().slice(0, 10);
  if (resetAt !== todayUtc()) {
    minutesUsedToday = 0;
    await db
      .updateTable("learner_profiles")
      .set({ minutes_used_today: 0, minutes_reset_at: todayUtc() })
      .where("user_id", "=", userId)
      .execute();
  }

  const cefr: CefrProfile = {
    speaking: row.speaking_cefr as CefrProfile["speaking"],
    listening: row.listening_cefr as CefrProfile["listening"],
    vocabulary: row.vocabulary_cefr as CefrProfile["vocabulary"],
    grammar: row.grammar_cefr as CefrProfile["grammar"],
  };

  return {
    userId,
    email: row.email,
    nativeLanguage: row.native_language,
    cefr,
    goals: (row.goals as unknown as string[]) ?? [],
    minutesUsedToday,
    freeDailyMinutes: env.FREE_DAILY_MINUTES,
    onboarded: row.onboarded,
    learningGoal: row.learning_goal,
    dailyGoalMinutes: row.daily_goal_minutes,
  };
}

/** Throw 402 if the learner has exhausted the free daily voice-minute quota. */
export async function assertQuota(userId: string): Promise<void> {
  const profile = await getProfile(userId);
  if (profile.minutesUsedToday >= profile.freeDailyMinutes) {
    throw Errors.quota();
  }
}

/** Assemble the live learner context that drives prompt construction. */
export async function getLearnerContext(userId: string): Promise<LearnerContext> {
  const profile = await getProfile(userId);

  const errors = await db
    .selectFrom("learner_errors")
    .select(["category", "example", "correction"])
    .where("user_id", "=", userId)
    .where("status", "!=", "resolved")
    .orderBy("severity", "desc")
    .orderBy("times_seen", "desc")
    .limit(5)
    .execute();

  const vocab = await db
    .selectFrom("vocabulary_items")
    .select("term")
    .where("user_id", "=", userId)
    .where("due_at", "<=", new Date())
    .orderBy("due_at", "asc")
    .limit(8)
    .execute();

  return {
    nativeLanguage: profile.nativeLanguage,
    cefr: profile.cefr,
    recurringErrors: errors,
    dueVocabulary: vocab.map((v) => v.term),
  };
}
