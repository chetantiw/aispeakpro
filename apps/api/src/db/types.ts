import type { ColumnType, Generated } from "kysely";

/**
 * Kysely database interface. Hand-authored (no engine/codegen download needed),
 * kept in lockstep with schema.sql. `ColumnType<Select, Insert, Update>` lets
 * generated / defaulted columns be optional on insert.
 */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type JsonValue = unknown;

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RefreshTokensTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  expires_at: Timestamp;
  revoked_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  created_at: Generated<Date>;
}

export interface LearnerProfilesTable {
  user_id: string;
  native_language: Generated<string>;
  speaking_cefr: Generated<string>;
  listening_cefr: Generated<string>;
  vocabulary_cefr: Generated<string>;
  grammar_cefr: Generated<string>;
  goals: ColumnType<string[], string | undefined, string>;
  minutes_used_today: Generated<number>;
  minutes_reset_at: ColumnType<Date, Date | string | undefined, Date | string>;
  learning_goal: ColumnType<string | null, string | null | undefined, string | null>;
  daily_goal_minutes: Generated<number>;
  onboarded: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CoursesTable {
  id: Generated<string>;
  slug: string;
  title: string;
  description: Generated<string>;
  goal: string;
  level: Generated<string>;
  lessons: ColumnType<unknown, string, string>;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface CourseEnrollmentsTable {
  id: Generated<string>;
  user_id: string;
  course_id: string;
  current_index: Generated<number>;
  completed: ColumnType<unknown, string | undefined, string>;
  enrolled_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LearnerErrorsTable {
  id: Generated<string>;
  user_id: string;
  category: string;
  example: string;
  correction: string;
  severity: Generated<number>;
  times_seen: Generated<number>;
  status: Generated<string>;
  first_seen_at: Generated<Date>;
  last_seen_at: Generated<Date>;
}

export interface VocabularyItemsTable {
  id: Generated<string>;
  user_id: string;
  term: string;
  definition: Generated<string>;
  ease: Generated<number>;
  interval_days: Generated<number>;
  repetitions: Generated<number>;
  due_at: Generated<Date>;
  last_reviewed_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  created_at: Generated<Date>;
}

export interface ScenariosTable {
  id: Generated<string>;
  slug: string;
  title: string;
  description: Generated<string>;
  mode: Generated<string>;
  difficulty: Generated<string>;
  setting: Generated<string>;
  objective: Generated<string>;
  personas: ColumnType<JsonValue, string, string>;
  beats: ColumnType<JsonValue, string, string>;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface SessionsTable {
  id: Generated<string>;
  user_id: string;
  scenario_id: ColumnType<string | null, string | null | undefined, string | null>;
  mode: Generated<string>;
  status: Generated<string>;
  started_at: Generated<Date>;
  ended_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  duration_seconds: Generated<number>;
  lesson_focus: ColumnType<string | null, string | null | undefined, string | null>;
  created_at: Generated<Date>;
}

export interface TurnsTable {
  id: Generated<string>;
  session_id: string;
  seq: number;
  speaker: string;
  persona_id: ColumnType<string | null, string | null | undefined, string | null>;
  text: string;
  audio_url: ColumnType<string | null, string | null | undefined, string | null>;
  pronunciation: ColumnType<JsonValue | null, string | null | undefined, string | null>;
  created_at: Generated<Date>;
}

export interface SessionFeedbackTable {
  id: Generated<string>;
  session_id: string;
  summary: Generated<string>;
  cefr_estimate: ColumnType<JsonValue, string, string>;
  strengths: ColumnType<JsonValue, string, string>;
  focus_areas: ColumnType<JsonValue, string, string>;
  created_at: Generated<Date>;
}

export interface Database {
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
  learner_profiles: LearnerProfilesTable;
  learner_errors: LearnerErrorsTable;
  vocabulary_items: VocabularyItemsTable;
  scenarios: ScenariosTable;
  sessions: SessionsTable;
  turns: TurnsTable;
  session_feedback: SessionFeedbackTable;
  courses: CoursesTable;
  course_enrollments: CourseEnrollmentsTable;
}
