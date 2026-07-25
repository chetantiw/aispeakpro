import type { LoginInput, RegisterInput, TokenPair } from "@aispeakpro/shared";
import { db } from "../db/index.js";
import { env } from "../env.js";
import { Errors } from "../http/errors.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from "../auth/tokens.js";

async function issueTokens(userId: string): Promise<TokenPair> {
  const accessToken = await signAccessToken(userId);
  const { token: refreshToken, hash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000);
  await db
    .insertInto("refresh_tokens")
    .values({ user_id: userId, token_hash: hash, expires_at: expiresAt })
    .execute();
  return { accessToken, refreshToken, expiresIn: env.ACCESS_TOKEN_TTL };
}

export async function register(input: RegisterInput): Promise<TokenPair> {
  const email = input.email.toLowerCase();
  const existing = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();
  if (existing) throw Errors.conflict("Email already registered");

  const passwordHash = await hashPassword(input.password);

  const userId = await db.transaction().execute(async (tx) => {
    const user = await tx
      .insertInto("users")
      .values({ email, password_hash: passwordHash })
      .returning("id")
      .executeTakeFirstOrThrow();
    await tx
      .insertInto("learner_profiles")
      .values({ user_id: user.id, native_language: input.nativeLanguage })
      .execute();
    return user.id;
  });

  return issueTokens(userId);
}

export async function login(input: LoginInput): Promise<TokenPair> {
  const email = input.email.toLowerCase();
  const user = await db
    .selectFrom("users")
    .select(["id", "password_hash"])
    .where("email", "=", email)
    .executeTakeFirst();
  // Verify against a dummy hash even when the user is missing to blunt timing
  // side-channels, then fail uniformly.
  const ok = user
    ? await verifyPassword(input.password, user.password_hash)
    : await verifyPassword(input.password, "scrypt$16384$00$00").then(() => false);
  if (!user || !ok) throw Errors.unauthorized("Invalid credentials");
  return issueTokens(user.id);
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  const hash = hashRefreshToken(refreshToken);
  const row = await db
    .selectFrom("refresh_tokens")
    .selectAll()
    .where("token_hash", "=", hash)
    .executeTakeFirst();
  if (!row || row.revoked_at || new Date(row.expires_at) < new Date()) {
    throw Errors.unauthorized("Invalid refresh token");
  }
  // Rotate: revoke the presented token and mint a fresh pair.
  await db
    .updateTable("refresh_tokens")
    .set({ revoked_at: new Date() })
    .where("id", "=", row.id)
    .execute();
  return issueTokens(row.user_id);
}

export async function logout(refreshToken: string): Promise<void> {
  const hash = hashRefreshToken(refreshToken);
  await db
    .updateTable("refresh_tokens")
    .set({ revoked_at: new Date() })
    .where("token_hash", "=", hash)
    .where("revoked_at", "is", null)
    .execute();
}
