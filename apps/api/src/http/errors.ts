/** Typed application error carrying an HTTP status + stable machine code. */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  unauthorized: (msg = "Authentication required") => new AppError(401, "unauthorized", msg),
  forbidden: (msg = "Forbidden") => new AppError(403, "forbidden", msg),
  notFound: (msg = "Not found") => new AppError(404, "not_found", msg),
  conflict: (msg = "Conflict") => new AppError(409, "conflict", msg),
  badRequest: (msg = "Bad request", details?: unknown) =>
    new AppError(400, "bad_request", msg, details),
  quota: (msg = "Daily free minutes exhausted") => new AppError(402, "quota_exceeded", msg),
  rateLimited: (msg = "Too many requests") => new AppError(429, "rate_limited", msg),
} as const;
