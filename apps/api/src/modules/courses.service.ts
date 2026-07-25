import type { Cefr, Course, CourseProgress, Lesson, SelfLevel } from "@aispeakpro/shared";
import { db } from "../db/index.js";
import { Errors } from "../http/errors.js";

/** Map the learner's self-assessed level onto a starting CEFR band. */
export function levelToCefr(level: SelfLevel): Cefr {
  switch (level) {
    case "beginner":
      return "A2";
    case "advanced":
      return "B2";
    default:
      return "B1";
  }
}

function toCourseDto(row: {
  id: string;
  slug: string;
  title: string;
  description: string;
  goal: string;
  level: string;
  lessons: unknown;
}): Course {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    goal: row.goal as Course["goal"],
    level: row.level as Cefr,
    lessons: (row.lessons as Lesson[]) ?? [],
  };
}

/** Pick the best course for a stated goal, falling back to the general track. */
export async function recommendCourseId(goal: string): Promise<string | null> {
  const match = await db
    .selectFrom("courses")
    .select("id")
    .where("goal", "=", goal)
    .where("is_active", "=", true)
    .executeTakeFirst();
  if (match) return match.id;

  const fallback = await db
    .selectFrom("courses")
    .select("id")
    .where("goal", "=", "daily")
    .where("is_active", "=", true)
    .executeTakeFirst();
  if (fallback) return fallback.id;

  const any = await db
    .selectFrom("courses")
    .select("id")
    .where("is_active", "=", true)
    .limit(1)
    .executeTakeFirst();
  return any?.id ?? null;
}

/** Enrol (or re-enrol) the learner into a course, resetting progress. */
export async function enroll(userId: string, courseId: string): Promise<void> {
  await db
    .insertInto("course_enrollments")
    .values({ user_id: userId, course_id: courseId })
    .onConflict((oc) =>
      oc.column("user_id").doUpdateSet({
        course_id: courseId,
        current_index: 0,
        completed: JSON.stringify([]),
        updated_at: new Date(),
      }),
    )
    .execute();
}

export async function getCourseProgress(userId: string): Promise<CourseProgress | null> {
  const enrollment = await db
    .selectFrom("course_enrollments")
    .selectAll()
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!enrollment) return null;

  const course = await db
    .selectFrom("courses")
    .selectAll()
    .where("id", "=", enrollment.course_id)
    .executeTakeFirst();
  if (!course) return null;

  const lessons = (course.lessons as Lesson[]) ?? [];
  const completed = (enrollment.completed as number[]) ?? [];
  return {
    course: toCourseDto(course),
    currentIndex: enrollment.current_index,
    completed,
    totalLessons: lessons.length,
    completedCount: completed.length,
  };
}

/** Mark the current lesson complete and advance to the next one. */
export async function advanceLesson(userId: string): Promise<CourseProgress | null> {
  const enrollment = await db
    .selectFrom("course_enrollments")
    .selectAll()
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!enrollment) throw Errors.notFound("No course enrolled");

  const course = await db
    .selectFrom("courses")
    .select("lessons")
    .where("id", "=", enrollment.course_id)
    .executeTakeFirst();
  const total = ((course?.lessons as Lesson[]) ?? []).length;

  const completed = new Set<number>((enrollment.completed as number[]) ?? []);
  completed.add(enrollment.current_index);
  const nextIndex = Math.min(enrollment.current_index + 1, total);

  await db
    .updateTable("course_enrollments")
    .set({
      current_index: nextIndex,
      completed: JSON.stringify([...completed].sort((a, b) => a - b)),
      updated_at: new Date(),
    })
    .where("user_id", "=", userId)
    .execute();

  return getCourseProgress(userId);
}

export async function listCourses(): Promise<Course[]> {
  const rows = await db
    .selectFrom("courses")
    .selectAll()
    .where("is_active", "=", true)
    .orderBy("level", "asc")
    .execute();
  return rows.map(toCourseDto);
}
