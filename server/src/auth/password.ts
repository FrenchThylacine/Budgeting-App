import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing with scrypt from `node:crypto`.
 *
 * scrypt rather than bcrypt or argon2 because it needs no native module to be
 * compiled. On Vercel the function is built in one environment and run in
 * another, and a native binding that fails to load takes the whole deployment
 * down — a risk with no upside here, since scrypt is a memory-hard KDF designed
 * for exactly this and ships with Node.
 *
 * The cost parameters are stored *inside* the encoded hash rather than read
 * from configuration at verification time. Raising the cost later must not
 * invalidate every existing password: an old hash carries the parameters it was
 * created with, so it still verifies, and can be transparently re-hashed on the
 * next successful sign-in.
 */

/** CPU/memory cost. 2^15 ≈ 32 MiB with r=8, comfortably inside a function's memory. */
const DEFAULT_COST = 15;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function costFromEnv(): number {
  // Tests hash many passwords; a lower cost keeps the suite fast without
  // changing the code path being tested. Never lowered outside tests.
  const raw = process.env.PASSWORD_SCRYPT_COST;
  if (!raw) return DEFAULT_COST;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 10 || parsed > 20) return DEFAULT_COST;
  return parsed;
}

/**
 * Minimum password length.
 *
 * Length is the only requirement. Composition rules ("one digit, one symbol")
 * measurably push people towards `Password1!` and its cousins, which is worse
 * than a longer passphrase.
 */
export const MIN_PASSWORD_LENGTH = 10;

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  // Guard against a memory-exhaustion request: scrypt cost is bounded, but the
  // input is not.
  if (password.length > 512) return "Password must be at most 512 characters.";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const cost = costFromEnv();
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptWithParams(password, salt, cost);
  return [
    "scrypt",
    cost,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Verify a password against an encoded hash.
 *
 * Returns false for malformed stored values rather than throwing, so a corrupt
 * row denies access instead of returning a 500 that distinguishes it from a
 * wrong password.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelization = Number(parts[3]);
  if (!Number.isInteger(cost) || cost < 10 || cost > 20) return false;
  if (blockSize !== BLOCK_SIZE || parallelization !== PARALLELIZATION) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;

  const actual = await scryptWithParams(password, salt, cost);

  // Constant-time: a byte-by-byte comparison leaks how much of the hash matched
  // through its timing, which is enough to reconstruct it one byte at a time.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** True when a stored hash was made with weaker parameters than we now use. */
export function needsRehash(encoded: string): boolean {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < costFromEnv();
}

function scryptWithParams(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  const N = 2 ** cost;
  // Node's default maxmem is 32 MiB, and scrypt needs roughly 128 * N * r —
  // 32 MiB exactly at N=2^15, r=8, so the call fails with the default. The
  // headroom is granted explicitly rather than left to chance, and it is
  // derived from the parameters so raising the cost cannot silently break
  // verification of hashes already in the database.
  const maxmem = 256 * N * BLOCK_SIZE;
  return scrypt(password, salt, KEY_LENGTH, { N, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem });
}
