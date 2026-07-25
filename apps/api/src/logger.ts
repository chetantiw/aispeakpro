import pino, { type LoggerOptions } from "pino";
import { env } from "./env.js";

export const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: "aispeakpro-api" },
  redact: {
    paths: ["req.headers.authorization", "password", "*.password", "passwordHash"],
    remove: true,
  },
};

/** Standalone logger for non-request contexts (queue, worker, jobs, bootstrap). */
export const logger = pino(loggerOptions);

export type Logger = typeof logger;
