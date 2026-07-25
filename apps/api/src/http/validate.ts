import type { z } from "zod";
import { Errors } from "./errors.js";

/**
 * Parse unknown input against a zod schema, throwing a 400 AppError on failure.
 * Returns the schema's *output* type (so defaults/transforms are applied).
 */
export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw Errors.badRequest("Validation failed", result.error.flatten());
  }
  return result.data as z.infer<S>;
}
