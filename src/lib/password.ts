import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing with scrypt from Node's standard library (no native dependency).
 * Stored as "scrypt$N$r$p$salt$hash" so the cost can be raised later without breaking old hashes.
 */
const N = 16384, R = 8, P = 1, KEYLEN = 64;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash used to spend the same time when an account doesn't exist, so timing doesn't reveal which emails have accounts. */
let dummy: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword("lyncei-placeholder-password");
  await verifyPassword(password, await dummy);
}

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
  "11111111", "iloveyou", "abc12345", "letmein1", "welcome1", "admin123", "lyncei123", "contraseña", "contrasena",
]);

/** Returns why a new password isn't acceptable, or null when it is. */
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return "That password is too easy to guess. Try a longer phrase.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Don't use your email address in your password.";
  return null;
}
