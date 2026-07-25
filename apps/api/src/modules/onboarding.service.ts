import type { CourseProgress, OnboardingInput, Profile } from "@aispeakpro/shared";
import { db } from "../db/index.js";
import { getProfile } from "./profile.service.js";
import {
  enroll,
  getCourseProgress,
  levelToCefr,
  recommendCourseId,
} from "./courses.service.js";

/**
 * Onboarding: capture the learner's motive, self-assessed level, and daily
 * commitment; seed their CEFR from the self-level; then recommend and enrol
 * them in a matching course. Returns the fresh profile + course progress.
 */
export async function submitOnboarding(
  userId: string,
  input: OnboardingInput,
): Promise<{ profile: Profile; progress: CourseProgress | null }> {
  const cefr = levelToCefr(input.selfLevel);

  await db
    .updateTable("learner_profiles")
    .set({
      learning_goal: input.goal,
      daily_goal_minutes: input.dailyGoalMinutes,
      onboarded: true,
      speaking_cefr: cefr,
      listening_cefr: cefr,
      vocabulary_cefr: cefr,
      grammar_cefr: cefr,
      ...(input.nativeLanguage ? { native_language: input.nativeLanguage } : {}),
      updated_at: new Date(),
    })
    .where("user_id", "=", userId)
    .execute();

  const courseId = await recommendCourseId(input.goal);
  if (courseId) await enroll(userId, courseId);

  const [profile, progress] = await Promise.all([
    getProfile(userId),
    getCourseProgress(userId),
  ]);
  return { profile, progress };
}
