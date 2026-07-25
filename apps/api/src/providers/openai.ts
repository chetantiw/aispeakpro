import { env } from "../env.js";
import type { ChatMessage, LLMProvider } from "./types.js";

/**
 * OpenAI-compatible chat provider (also works with Azure OpenAI, Together,
 * Groq, local vLLM, etc. by changing OPENAI_BASE_URL). Uses fetch — no SDK.
 */
export class OpenAILLMProvider implements LLMProvider {
  async chat(
    messages: ChatMessage[],
    opts?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        messages,
        temperature: opts?.temperature ?? 0.7,
        max_tokens: opts?.maxTokens ?? 300,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM upstream ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content?.trim() ?? "";
  }
}
