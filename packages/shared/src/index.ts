import { z } from "zod";

/**
 * Shared contracts between the API, the workers, and every client (web + mobile).
 * These zod schemas are the single source of truth for request/response shapes;
 * the API validates against them and clients infer TypeScript types from them.
 */

// ---------------------------------------------------------------------------
// Domain enums
// ---------------------------------------------------------------------------

/** CEFR proficiency levels, ordered from beginner to mastery. */
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const cefrSchema = z.enum(CEFR_LEVELS);
export type Cefr = z.infer<typeof cefrSchema>;

export const sessionModeSchema = z.enum(["tutor", "scene"]);
export type SessionMode = z.infer<typeof sessionModeSchema>;

export const sessionStatusSchema = z.enum(["active", "completed", "abandoned"]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const speakerSchema = z.enum(["learner", "tutor", "persona", "system"]);
export type Speaker = z.infer<typeof speakerSchema>;

export const errorStatusSchema = z.enum(["open", "improving", "resolved"]);
export type ErrorStatus = z.infer<typeof errorStatusSchema>;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  nativeLanguage: z.string().min(2).max(40).default("Hindi"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(10) });

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

// ---------------------------------------------------------------------------
// Learner profile
// ---------------------------------------------------------------------------

export const cefrProfileSchema = z.object({
  speaking: cefrSchema,
  listening: cefrSchema,
  vocabulary: cefrSchema,
  grammar: cefrSchema,
});
export type CefrProfile = z.infer<typeof cefrProfileSchema>;

export const profileSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  nativeLanguage: z.string(),
  cefr: cefrProfileSchema,
  goals: z.array(z.string()).default([]),
  minutesUsedToday: z.number().int().nonnegative(),
  freeDailyMinutes: z.number().int().positive(),
});
export type Profile = z.infer<typeof profileSchema>;

export const updateProfileSchema = z.object({
  nativeLanguage: z.string().min(2).max(40).optional(),
  goals: z.array(z.string().max(120)).max(10).optional(),
});

// ---------------------------------------------------------------------------
// Scenarios & personas (scene-based learning)
// ---------------------------------------------------------------------------

export const personaSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  voice: z.string(),
  persona: z.string(), // system-prompt fragment describing behaviour
});
export type Persona = z.infer<typeof personaSchema>;

export const scenarioSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  mode: sessionModeSchema,
  difficulty: cefrSchema,
  setting: z.string(),
  objective: z.string(),
  personas: z.array(personaSchema),
  beats: z.array(z.string()),
});
export type Scenario = z.infer<typeof scenarioSchema>;

// ---------------------------------------------------------------------------
// Sessions & turns
// ---------------------------------------------------------------------------

export const createSessionSchema = z.object({
  mode: sessionModeSchema,
  scenarioSlug: z.string().optional(),
});
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const pronunciationScoreSchema = z.object({
  accuracy: z.number().min(0).max(100),
  fluency: z.number().min(0).max(100),
  completeness: z.number().min(0).max(100),
  prosody: z.number().min(0).max(100),
  words: z
    .array(z.object({ word: z.string(), score: z.number().min(0).max(100) }))
    .default([]),
});
export type PronunciationScore = z.infer<typeof pronunciationScoreSchema>;

export const turnSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  seq: z.number().int(),
  speaker: speakerSchema,
  personaId: z.string().nullable().optional(),
  text: z.string(),
  pronunciation: pronunciationScoreSchema.nullable().optional(),
  createdAt: z.string(),
});
export type Turn = z.infer<typeof turnSchema>;

/** Learner submits a spoken (already transcribed) turn; API returns the reply turn(s). */
export const submitTurnSchema = z.object({
  text: z.string().min(1).max(2000),
  pronunciation: pronunciationScoreSchema.optional(),
});
export type SubmitTurnInput = z.infer<typeof submitTurnSchema>;

export const sessionSchema = z.object({
  id: z.string().uuid(),
  mode: sessionModeSchema,
  status: sessionStatusSchema,
  scenarioSlug: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationSeconds: z.number().int().nonnegative(),
});
export type Session = z.infer<typeof sessionSchema>;

// ---------------------------------------------------------------------------
// Feedback (pedagogy output)
// ---------------------------------------------------------------------------

export const minedErrorSchema = z.object({
  category: z.string(),
  example: z.string(),
  correction: z.string(),
  severity: z.number().int().min(1).max(5),
});
export type MinedError = z.infer<typeof minedErrorSchema>;

export const sessionFeedbackSchema = z.object({
  sessionId: z.string().uuid(),
  summary: z.string(),
  cefrEstimate: cefrProfileSchema,
  strengths: z.array(z.string()),
  focusAreas: z.array(z.string()),
  errors: z.array(minedErrorSchema),
  newVocabulary: z.array(z.string()),
});
export type SessionFeedback = z.infer<typeof sessionFeedbackSchema>;

// ---------------------------------------------------------------------------
// Vocabulary / spaced repetition
// ---------------------------------------------------------------------------

export const vocabItemSchema = z.object({
  id: z.string().uuid(),
  term: z.string(),
  definition: z.string(),
  dueAt: z.string(),
  repetitions: z.number().int(),
  intervalDays: z.number(),
  ease: z.number(),
});
export type VocabItem = z.infer<typeof vocabItemSchema>;

/** SM-2 review grade: 0 (total blackout) .. 5 (perfect recall). */
export const reviewGradeSchema = z.object({ grade: z.number().int().min(0).max(5) });

// ---------------------------------------------------------------------------
// Realtime websocket protocol
// ---------------------------------------------------------------------------

export const wsClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user_turn"), text: z.string().min(1).max(2000) }),
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("end") }),
]);
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;

export type WsServerMessage =
  | { type: "ready"; sessionId: string }
  | { type: "agent_turn"; speaker: Speaker; personaId?: string | null; text: string; seq: number }
  | { type: "pong" }
  | { type: "quota_exceeded"; message: string }
  | { type: "error"; message: string }
  | { type: "ended"; sessionId: string };

// ---------------------------------------------------------------------------
// Generic API error envelope
// ---------------------------------------------------------------------------

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const CEFR_ORDER: Record<Cefr, number> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
  C2: 5,
};
