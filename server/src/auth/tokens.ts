import { createHash, randomBytes, randomUUID } from "node:crypto";

/**
 * Opaque bearer tokens for sessions and password resets.
 *
 * Opaque rather than signed (JWT) because these must be *revocable*. Signing out
 * has to end the session immediately, and a password reset has to invalidate
 * every session that existed before it — neither is possible when the token
 * itself is the proof and the server holds no record of it. The cost is one
 * indexed lookup per request, which is the right trade for a financial app.
 *
 * Only the SHA-256 of a token is stored. A leaked database backup therefore
 * yields no usable session, exactly as with passwords. SHA-256 is sufficient
 * here where it would not be for passwords: the token is 256 bits of CSPRNG
 * output, so there is no dictionary to run against it.
 */

/** 32 bytes of CSPRNG output, URL-safe so it survives an email link intact. */
export function createToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

/** How long a signed-in session stays valid without re-authentication. */
export const SESSION_TTL_DAYS = 30;

/** Reset links are short-lived: they arrive by email, which is not a secure channel. */
export const RESET_TTL_MINUTES = 30;

export function expiryFromNow(milliseconds: number, now = new Date()): Date {
  return new Date(now.getTime() + milliseconds);
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;
