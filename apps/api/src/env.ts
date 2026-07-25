import { z } from "zod";

/**
 * Fail-fast environment parsing. The process must not boot with a broken config.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().default(8080),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional().or(z.literal("")),

  JWT_ACCESS_SECRET: z.string().min(24),
  JWT_REFRESH_SECRET: z.string().min(24),
  ACCESS_TOKEN_TTL: z.coerce.number().int().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().default(2_592_000),

  LLM_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
  TTS_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
  STT_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
  PRONUNCIATION_PROVIDER: z.enum(["mock", "azure"]).default("mock"),

  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  FREE_DAILY_MINUTES: z.coerce.number().int().positive().default(15),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Environment validation failed");
  }
  cached = parsed.data;
  return cached;
}

export const env = loadEnv();
export const redisEnabled = !!env.REDIS_URL;
