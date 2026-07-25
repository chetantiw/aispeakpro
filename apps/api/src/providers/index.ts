import { env } from "../env.js";
import { MockLLMProvider, MockPronunciationProvider } from "./mock.js";
import { OpenAILLMProvider } from "./openai.js";
import type { LLMProvider, PronunciationProvider } from "./types.js";

/**
 * Provider factory. Everything is behind an interface so swapping vendors (or
 * self-hosting an open-weight model at scale) is a one-line config change with
 * no call-site edits.
 */
let llm: LLMProvider | null = null;
let pronunciation: PronunciationProvider | null = null;

export function getLLM(): LLMProvider {
  if (llm) return llm;
  llm = env.LLM_PROVIDER === "openai" ? new OpenAILLMProvider() : new MockLLMProvider();
  return llm;
}

export function getPronunciation(): PronunciationProvider {
  if (pronunciation) return pronunciation;
  // Only the mock ships in the MVP; the Azure adapter slots in here later.
  pronunciation = new MockPronunciationProvider();
  return pronunciation;
}

export type { ChatMessage, LLMProvider, PronunciationProvider } from "./types.js";
