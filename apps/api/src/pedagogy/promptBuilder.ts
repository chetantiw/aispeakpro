import type { CefrProfile, Persona, Scenario } from "@aispeakpro/shared";

/**
 * The prompt builder is the product's core IP: it assembles a bespoke system
 * prompt for every turn from the learner's live state. A generic "you are an
 * English tutor" prompt is a commodity; *this* — targeting the learner's exact
 * CEFR level, recurring errors, and due vocabulary — is the teaching engine.
 */
export interface LearnerContext {
  nativeLanguage: string;
  cefr: CefrProfile;
  /** The learner's recurring mistakes, so the tutor can elicit and correct them. */
  recurringErrors: { category: string; example: string; correction: string }[];
  /** Vocabulary due for spaced-repetition review — weave these in naturally. */
  dueVocabulary: string[];
}

const CORRECTION_POLICY = [
  "Correction policy:",
  "- Keep the learner talking; do not interrupt the flow for tiny slips.",
  "- Recast serious errors: repeat their sentence back correctly, then continue.",
  "- Correct at most ONE thing per reply. Never lecture.",
  "- Match your vocabulary and sentence length to the learner's CEFR level.",
].join("\n");

function cefrLine(cefr: CefrProfile): string {
  return `speaking ${cefr.speaking}, listening ${cefr.listening}, vocabulary ${cefr.vocabulary}, grammar ${cefr.grammar}`;
}

export function buildTutorSystemPrompt(ctx: LearnerContext): string {
  const parts: string[] = [
    "You are a warm, encouraging one-to-one spoken-English tutor.",
    `The learner's first language is ${ctx.nativeLanguage}. Their CEFR levels are: ${cefrLine(ctx.cefr)}.`,
    "Speak naturally, ask one question at a time, and give the learner most of the talking time.",
  ];

  if (ctx.recurringErrors.length) {
    const lines = ctx.recurringErrors
      .slice(0, 5)
      .map((e) => `- ${e.category}: they say "${e.example}" (correct: "${e.correction}")`)
      .join("\n");
    parts.push(`This learner's recurring errors — steer the conversation to elicit and gently fix these:\n${lines}`);
  }

  if (ctx.dueVocabulary.length) {
    parts.push(`Try to naturally use these review words: ${ctx.dueVocabulary.slice(0, 8).join(", ")}.`);
  }

  parts.push(CORRECTION_POLICY);
  return parts.join("\n\n");
}

export function buildPersonaSystemPrompt(
  scenario: Scenario,
  persona: Persona,
  ctx: LearnerContext,
): string {
  return [
    `You are ${persona.name}, ${persona.role}, in a role-play scene: "${scenario.title}".`,
    `Setting: ${scenario.setting}`,
    `Scene objective (for the learner): ${scenario.objective}`,
    `Your character: ${persona.persona}`,
    `The learner is a ${ctx.nativeLanguage} speaker at roughly CEFR ${ctx.cefr.speaking} for speaking. Keep your language at or slightly above that level.`,
    "Stay fully in character. Keep each turn short (1–3 sentences) so the conversation stays lively. Do not break role to give feedback.",
  ].join("\n");
}

/**
 * The Scene Director decides who speaks next in a multi-bot scene. It returns a
 * persona id (or "learner") — this is the turn-taking arbiter that keeps
 * multiple bots from talking over each other.
 */
export function buildDirectorPrompt(scenario: Scenario, recentTranscript: string): string {
  const cast = scenario.personas.map((p) => `${p.id} (${p.name}, ${p.role})`).join("; ");
  return [
    `You are the director of the scene "${scenario.title}". Cast: ${cast}. The human learner is "learner".`,
    `Scene beats: ${scenario.beats.join(" -> ")}`,
    "Given the recent transcript, decide who should speak next to keep the scene moving and to give the learner room to participate.",
    'Reply with ONLY a JSON object: {"next":"<persona_id_or_learner>"}.',
    `Recent transcript:\n${recentTranscript}`,
  ].join("\n");
}
