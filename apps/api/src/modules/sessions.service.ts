import type {
  CreateSessionInput,
  PronunciationScore,
  Session,
  Turn,
} from "@aispeakpro/shared";
import { db } from "../db/index.js";
import { Errors } from "../http/errors.js";
import { getLLM } from "../providers/index.js";
import { buildTutorSystemPrompt } from "../pedagogy/promptBuilder.js";
import type { ChatMessage } from "../providers/types.js";
import { getLearnerContext } from "./profile.service.js";
import { enqueueFeedback } from "../queue.js";

// Keep the live context window bounded; older turns are summarised implicitly
// by the tutor and fully preserved in the DB for post-session analysis.
const MAX_CONTEXT_TURNS = 12;

function toSessionDto(row: {
  id: string;
  mode: string;
  status: string;
  scenario_slug?: string | null;
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number;
}): Session {
  return {
    id: row.id,
    mode: row.mode as Session["mode"],
    status: row.status as Session["status"],
    scenarioSlug: row.scenario_slug ?? null,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
    durationSeconds: row.duration_seconds,
  };
}

function toTurnDto(row: {
  id: string;
  session_id: string;
  seq: number;
  speaker: string;
  persona_id: string | null;
  text: string;
  pronunciation: unknown;
  created_at: Date;
}): Turn {
  return {
    id: row.id,
    sessionId: row.session_id,
    seq: row.seq,
    speaker: row.speaker as Turn["speaker"],
    personaId: row.persona_id,
    text: row.text,
    pronunciation: (row.pronunciation as PronunciationScore | null) ?? null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function startSession(
  userId: string,
  input: CreateSessionInput,
): Promise<Session> {
  let scenarioId: string | null = null;
  if (input.scenarioSlug) {
    const scenario = await db
      .selectFrom("scenarios")
      .select("id")
      .where("slug", "=", input.scenarioSlug)
      .where("is_active", "=", true)
      .executeTakeFirst();
    if (!scenario) throw Errors.notFound("Scenario not found");
    scenarioId = scenario.id;
  }

  const row = await db
    .insertInto("sessions")
    .values({ user_id: userId, scenario_id: scenarioId, mode: input.mode, status: "active" })
    .returningAll()
    .executeTakeFirstOrThrow();

  return toSessionDto({ ...row, scenario_slug: input.scenarioSlug ?? null });
}

async function loadOwnedActiveSession(userId: string, sessionId: string) {
  const session = await db
    .selectFrom("sessions")
    .selectAll()
    .where("id", "=", sessionId)
    .executeTakeFirst();
  if (!session || session.user_id !== userId) throw Errors.notFound("Session not found");
  if (session.status !== "active") throw Errors.badRequest("Session is not active");
  return session;
}

async function nextSeq(sessionId: string): Promise<number> {
  const row = await db
    .selectFrom("turns")
    .select((eb) => eb.fn.max("seq").as("m"))
    .where("session_id", "=", sessionId)
    .executeTakeFirst();
  return (Number(row?.m ?? -1)) + 1;
}

async function recentTurns(sessionId: string): Promise<ChatMessage[]> {
  const rows = await db
    .selectFrom("turns")
    .select(["speaker", "text"])
    .where("session_id", "=", sessionId)
    .orderBy("seq", "desc")
    .limit(MAX_CONTEXT_TURNS)
    .execute();
  return rows
    .reverse()
    .map((r) => ({
      role: r.speaker === "learner" ? "user" : "assistant",
      content: r.text,
    }));
}

/**
 * The core conversational loop, shared by the HTTP fallback and the websocket:
 * persist the learner's turn, build a live-context prompt, get the tutor reply,
 * persist it, and return it.
 */
export async function submitLearnerTurn(
  userId: string,
  sessionId: string,
  text: string,
  pronunciation?: PronunciationScore,
): Promise<{ learnerTurn: Turn; agentTurn: Turn }> {
  await loadOwnedActiveSession(userId, sessionId);

  const seq = await nextSeq(sessionId);
  const learnerRow = await db
    .insertInto("turns")
    .values({
      session_id: sessionId,
      seq,
      speaker: "learner",
      text,
      pronunciation: pronunciation ? JSON.stringify(pronunciation) : null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  const ctx = await getLearnerContext(userId);
  const history = await recentTurns(sessionId);
  const messages: ChatMessage[] = [
    { role: "system", content: buildTutorSystemPrompt(ctx) },
    ...history,
  ];

  const reply = await getLLM().chat(messages, { temperature: 0.7, maxTokens: 200 });

  const agentRow = await db
    .insertInto("turns")
    .values({ session_id: sessionId, seq: seq + 1, speaker: "tutor", text: reply })
    .returningAll()
    .executeTakeFirstOrThrow();

  return { learnerTurn: toTurnDto(learnerRow), agentTurn: toTurnDto(agentRow) };
}

export async function completeSession(userId: string, sessionId: string): Promise<Session> {
  const session = await loadOwnedActiveSession(userId, sessionId);
  const endedAt = new Date();
  const durationSeconds = Math.max(
    0,
    Math.round((endedAt.getTime() - new Date(session.started_at).getTime()) / 1000),
  );

  const updated = await db
    .updateTable("sessions")
    .set({ status: "completed", ended_at: endedAt, duration_seconds: durationSeconds })
    .where("id", "=", sessionId)
    .returningAll()
    .executeTakeFirstOrThrow();

  // Meter voice minutes against the daily quota (ceil so any use counts).
  const minutes = Math.ceil(durationSeconds / 60);
  if (minutes > 0) {
    await db
      .updateTable("learner_profiles")
      .set((eb) => ({ minutes_used_today: eb("minutes_used_today", "+", minutes) }))
      .where("user_id", "=", userId)
      .execute();
  }

  // Hand off the expensive analysis to the async worker (or inline if no queue).
  await enqueueFeedback({ sessionId, userId });

  return toSessionDto(updated);
}

export async function listSessions(userId: string, limit = 20): Promise<Session[]> {
  const rows = await db
    .selectFrom("sessions")
    .leftJoin("scenarios", "scenarios.id", "sessions.scenario_id")
    .selectAll("sessions")
    .select("scenarios.slug as scenario_slug")
    .where("sessions.user_id", "=", userId)
    .orderBy("sessions.started_at", "desc")
    .limit(Math.min(limit, 100))
    .execute();
  return rows.map(toSessionDto);
}

export async function getSessionDetail(userId: string, sessionId: string) {
  const session = await db
    .selectFrom("sessions")
    .leftJoin("scenarios", "scenarios.id", "sessions.scenario_id")
    .selectAll("sessions")
    .select("scenarios.slug as scenario_slug")
    .where("sessions.id", "=", sessionId)
    .executeTakeFirst();
  if (!session || session.user_id !== userId) throw Errors.notFound("Session not found");

  const turns = await db
    .selectFrom("turns")
    .selectAll()
    .where("session_id", "=", sessionId)
    .orderBy("seq", "asc")
    .execute();

  const feedback = await db
    .selectFrom("session_feedback")
    .selectAll()
    .where("session_id", "=", sessionId)
    .executeTakeFirst();

  return {
    session: toSessionDto(session),
    turns: turns.map(toTurnDto),
    feedback: feedback
      ? {
          sessionId,
          summary: feedback.summary,
          cefrEstimate: feedback.cefr_estimate,
          strengths: feedback.strengths,
          focusAreas: feedback.focus_areas,
        }
      : null,
  };
}
