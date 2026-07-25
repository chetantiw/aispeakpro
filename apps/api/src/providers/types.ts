export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMProvider {
  /** Single-shot chat completion used for live conversational turns. */
  chat(messages: ChatMessage[], opts?: { temperature?: number; maxTokens?: number }): Promise<string>;
}

export interface PronunciationProvider {
  /**
   * Score a spoken utterance against its reference text. In production this is
   * Azure Pronunciation Assessment; the mock returns a plausible deterministic
   * score so the whole pipeline is exercisable offline.
   */
  score(referenceText: string): Promise<{
    accuracy: number;
    fluency: number;
    completeness: number;
    prosody: number;
    words: { word: string; score: number }[];
  }>;
}
