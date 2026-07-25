import type { CefrProfile, MinedError, SessionFeedback } from "@aispeakpro/shared";
import type { LLMProvider } from "../providers/types.js";

/**
 * Post-session analysis. Two paths:
 *  - `heuristicFeedback`: pure, deterministic, offline. Cheap first pass that
 *    catches common L1-transfer errors and mines candidate vocabulary. Fully
 *    unit-tested, and the default when no LLM is configured.
 *  - `generateFeedback`: uses the LLM for richer error mining when available,
 *    falling back to the heuristic on any failure so a session is never lost.
 */

const COMMON_FILLERS = new Set(["um", "uh", "like", "actually", "basically"]);
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "i", "you", "he", "she", "it", "we", "they",
  "is", "am", "are", "was", "were", "be", "to", "of", "in", "on", "for", "with", "my",
  "your", "this", "that", "have", "has", "do", "did", "not", "so", "very", "me",
]);

export function heuristicFeedback(
  learnerTexts: string[],
  profile: CefrProfile,
): Omit<SessionFeedback, "sessionId"> {
  const errors: MinedError[] = [];
  const joined = learnerTexts.join(" ");

  // 1) Article omission before a singular common noun ("go to market").
  for (const text of learnerTexts) {
    const m = text.match(/\bgo to (market|office|hospital|station|airport)\b/i);
    if (m) {
      errors.push({
        category: "article_omission",
        example: m[0],
        correction: m[0].replace(/go to /i, "go to the "),
        severity: 3,
      });
      break;
    }
  }

  // 2) Lowercase standalone "i".
  if (/\bi\b/.test(joined)) {
    errors.push({
      category: "capitalization",
      example: "i think ...",
      correction: "I think ...",
      severity: 1,
    });
  }

  // 3) Overuse of filler words.
  const fillerCount = joined
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => COMMON_FILLERS.has(w)).length;
  if (fillerCount >= 3) {
    errors.push({
      category: "fluency_fillers",
      example: `used filler words ${fillerCount} times`,
      correction: "Pause silently instead of saying 'um' / 'like'.",
      severity: 2,
    });
  }

  // Candidate vocabulary: longer, non-stopword tokens the learner produced.
  const newVocabulary = Array.from(
    new Set(
      joined
        .toLowerCase()
        .replace(/[^a-z\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length >= 6 && !STOPWORDS.has(w)),
    ),
  ).slice(0, 8);

  const wordCount = joined.split(/\s+/).filter(Boolean).length;
  const strengths: string[] = [];
  if (wordCount > 40) strengths.push("Produced a good volume of speech.");
  if (errors.every((e) => e.severity <= 2)) strengths.push("No major grammar breakdowns.");
  if (!strengths.length) strengths.push("Completed the session — consistency matters most.");

  const focusAreas = errors.length
    ? Array.from(new Set(errors.map((e) => e.category.replace(/_/g, " "))))
    : ["Keep practising — try longer, more detailed answers."];

  return {
    summary: `You spoke about ${wordCount} words across ${learnerTexts.length} turns. ${
      errors.length ? `We spotted ${errors.length} thing(s) to work on.` : "Clean session — well done."
    }`,
    cefrEstimate: profile,
    strengths,
    focusAreas,
    errors,
    newVocabulary,
  };
}

export async function generateFeedback(
  learnerTexts: string[],
  profile: CefrProfile,
  llm: LLMProvider,
  useLLM: boolean,
): Promise<Omit<SessionFeedback, "sessionId">> {
  const base = heuristicFeedback(learnerTexts, profile);
  if (!useLLM || !learnerTexts.length) return base;

  try {
    const prompt = [
      "You are an ESL assessor. Analyse the learner's utterances below.",
      'Return ONLY JSON: {"summary":string,"strengths":string[],"focusAreas":string[],"errors":[{"category":string,"example":string,"correction":string,"severity":1-5}]}.',
      "Utterances:",
      ...learnerTexts.map((t, i) => `${i + 1}. ${t}`),
    ].join("\n");
    const raw = await llm.chat([{ role: "user", content: prompt }], { temperature: 0.2 });
    const json = JSON.parse(extractJson(raw)) as Partial<Omit<SessionFeedback, "sessionId">>;
    return {
      ...base,
      summary: json.summary ?? base.summary,
      strengths: json.strengths ?? base.strengths,
      focusAreas: json.focusAreas ?? base.focusAreas,
      errors: json.errors ?? base.errors,
    };
  } catch {
    return base; // never lose a session to a flaky model call
  }
}

function extractJson(s: string): string {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  return start >= 0 && end > start ? s.slice(start, end + 1) : "{}";
}
