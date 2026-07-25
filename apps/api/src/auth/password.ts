import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;
const N = 16_384; // CPU/memory cost

/** Promise wrapper that preserves the options overload (promisify loses it). */
function scrypt(password: string, salt: Buffer, keylen: number, opts: { N: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    _scrypt(password, salt, keylen, opts, (err, derived) => {
      if (err) reject(err);
      else resolve(derived as Buffer);
    });
  });
}

/**
 * Password hashing with Node's built-in scrypt — no native modules, works in
 * every environment. Format: scrypt$<N>$<saltHex>$<hashHex>.
 * (In production behind a managed auth provider you'd delegate this entirely.)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, KEYLEN, { N })) as Buffer;
  return `scrypt$${N}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const salt = Buffer.from(parts[2] ?? "", "hex");
  const expected = Buffer.from(parts[3] ?? "", "hex");
  const derived = (await scrypt(password, salt, expected.length, { N: n })) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
