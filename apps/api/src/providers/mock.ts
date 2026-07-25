import { createHash } from "node:crypto";
import type { ChatMessage, LLMProvider, PronunciationProvider } from "./types.js";

/** Deterministic pseudo-random in [0,1) seeded by a string — stable across runs. */
function seeded(seed: string): number {
  const h = createHash("sha256").update(seed).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

/**
 * Offline conversational stand-in. It is intentionally simple but *responsive*:
 * it acknowledges the learner's last message, asks a follow-up, and gently
 * models correct English so the end-to-end loop is demoable with zero API keys.
 */
export class MockLLMProvider implements LLMProvider {
  async chat(messages: ChatMessage[]): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = lastUser?.content?.trim() ?? "";
    if (!text) return "Hello! I'm your English tutor. Tell me about your day.";

    const followUps = [
      "That's interesting — can you tell me more about that?",
      "Nice. Why do you think that is?",
      "Good. And how did that make you feel?",
      "I see. What happened next?",
      "Great effort. Can you say that again using the past tense?",
    ];
    const pick = followUps[Math.floor(seeded(text) * followUps.length)] ?? followUps[0]!;
    const echo = text.length > 60 ? `${text.slice(0, 57)}…` : text;
    return `You said: "${echo}". ${pick}`;
  }
}

export class MockPronunciationProvider implements PronunciationProvider {
  async score(referenceText: string) {
    const words = referenceText
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 50)
      .map((word) => ({ word, score: Math.round(70 + seeded(word) * 30) }));
    const avg = words.length
      ? words.reduce((s, w) => s + w.score, 0) / words.length
      : 85;
    return {
      accuracy: Math.round(avg),
      fluency: Math.round(72 + seeded(referenceText) * 25),
      completeness: 100,
      prosody: Math.round(70 + seeded(referenceText + "p") * 25),
      words,
    };
  }
}
