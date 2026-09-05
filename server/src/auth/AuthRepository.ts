import { getDatabase } from "../db/index.js";
import { query as execQuery } from "../db/queryHelper.js";
import { createId } from "./tokens.js";

export interface UserRecord {
  id: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  snapshotId: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  snapshotId: string;
  email: string;
}

/**
 * Normalize an email for lookup and uniqueness.
 *
 * Only case is folded. Provider-specific rules — stripping dots, cutting at a
 * `+` — are deliberately not applied: they are not universal, and applying
 * Gmail's rules to a self-hosted domain would merge two genuinely different
 * mailboxes into one account.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Whether a string is plausibly an email address.
 *
 * Deliberately permissive. The definitive test is whether mail arrives, and a
 * strict regexp rejects valid addresses (new TLDs, unicode local parts) far
 * more often than it catches a real mistake.
 */
export function isPlausibleEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return false;
  if (/\s/.test(trimmed)) return false;
  const at = trimmed.indexOf("@");
  return at > 0 && at === trimmed.lastIndexOf("@") && at < trimmed.length - 1;
}

export class AuthRepository {
  constructor(private sql = getDatabase()) {}

  private async query(text: string, params: unknown[] = []): Promise<Record<string, any>[]> {
    return execQuery(this.sql, text, params);
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const rows = await this.query(
      `SELECT id, email, email_normalized, password_hash, snapshot_id, created_at
         FROM users WHERE email_normalized = $1`,
      [normalizeEmail(email)],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const rows = await this.query(
      `SELECT id, email, email_normalized, password_hash, snapshot_id, created_at
         FROM users WHERE id = $1`,
      [id],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async countUsers(): Promise<number> {
    const rows = await this.query(`SELECT count(*)::int AS n FROM users`);
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * The budget id a new account should own.
   *
   * Always a fresh one. An earlier version had the first account adopt the
   * pre-existing `active` budget so the pre-accounts data would not be
   * orphaned, but that makes the first account different from every other one
   * and hands whoever signs up first a budget they did not create. Data from
   * before accounts existed is recovered by importing it, which is a deliberate
   * act with a preview rather than a side effect of signing up.
   */
  async snapshotIdForNewUser(): Promise<string> {
    return createId("snap");
  }

  /**
   * Create an account.
   *
   * Returns null when the email is already taken. That is detected from the
   * unique constraint rather than a prior SELECT, because two simultaneous
   * signups both pass a check-then-insert and the loser crashes with a 500
   * instead of a clean "already registered".
   */
  async createUser(
    email: string,
    passwordHash: string,
    snapshotId: string,
    now: string,
  ): Promise<UserRecord | null> {
    const id = createId("usr");
    try {
      await this.query(
        `INSERT INTO users (id, email, email_normalized, password_hash, snapshot_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, email.trim(), normalizeEmail(email), passwordHash, snapshotId, now, now],
      );
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
    return {
      id,
      email: email.trim(),
      emailNormalized: normalizeEmail(email),
      passwordHash,
      snapshotId,
      createdAt: now,
    };
  }

  async updatePassword(userId: string, passwordHash: string, now: string): Promise<void> {
    await this.query(`UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`, [
      passwordHash,
      now,
      userId,
    ]);
  }

  /**
   * Change the address on an account.
   *
   * Both forms are written: the normalised one is what uniqueness and sign-in
   * match on, the original is what the user typed and what correspondence is
   * addressed to. Writing one without the other would let two accounts collide
   * or leave sign-in matching an address the user no longer has.
   */
  async updateEmail(userId: string, email: string, now: string): Promise<void> {
    await this.query(
      `UPDATE users SET email = $1, email_normalized = $2, updated_at = $3 WHERE id = $4`,
      [email.trim(), normalizeEmail(email), now, userId],
    );
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  async createSession(userId: string, tokenHash: string, ttlDays: number): Promise<void> {
    await this.query(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at)
       VALUES ($1, $2, $3, NOW(), NOW(), NOW() + ($4 || ' days')::interval)`,
      [createId("ses"), userId, tokenHash, String(ttlDays)],
    );
  }

  /**
   * Resolve a session token to its owner.
   *
   * Expiry is compared in the database rather than in JavaScript, so a wrong
   * clock on one serverless instance cannot extend a session.
   */
  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const rows = await this.query(
      `SELECT s.id, s.user_id, u.snapshot_id, u.email
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, userId: row.user_id, snapshotId: row.snapshot_id, email: row.email };
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.query(`UPDATE sessions SET last_seen_at = NOW() WHERE id = $1`, [sessionId]);
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
  }

  /** Used after a password change: every other device must be signed out. */
  async deleteAllSessionsForUser(userId: string): Promise<void> {
    await this.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  }

  // ─── Password reset ───────────────────────────────────────────────────────

  async createResetToken(userId: string, tokenHash: string, ttlMinutes: number): Promise<void> {
    // One live reset per account: issuing a new link invalidates the previous
    // one, so a forwarded or intercepted older email stops working.
    await this.query(`DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL`, [userId]);
    await this.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at)
       VALUES ($1, $2, $3, NOW(), NOW() + ($4 || ' minutes')::interval)`,
      [createId("prt"), userId, tokenHash, String(ttlMinutes)],
    );
  }

  /**
   * Consume a reset token.
   *
   * The claim and the consumption are one statement: `UPDATE ... WHERE
   * used_at IS NULL ... RETURNING` lets the database decide the winner, so two
   * requests carrying the same token cannot both proceed.
   */
  async consumeResetToken(tokenHash: string): Promise<string | null> {
    const rows = await this.query(
      `UPDATE password_reset_tokens
          SET used_at = NOW()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
        RETURNING user_id`,
      [tokenHash],
    );
    return rows[0]?.user_id ?? null;
  }

  // ─── Rate limiting ────────────────────────────────────────────────────────

  /**
   * Count recent attempts in a bucket, then record this one.
   *
   * Backed by the database because serverless instances share no memory: an
   * in-process counter resets on every cold start and is per-instance besides,
   * so it would cap nothing under the traffic it is meant to stop.
   */
  async recordAndCountAttempts(bucket: string, windowMinutes: number): Promise<number> {
    const rows = await this.query(
      `SELECT count(*)::int AS n FROM auth_attempts
        WHERE bucket = $1 AND created_at > NOW() - ($2 || ' minutes')::interval`,
      [bucket, String(windowMinutes)],
    );
    const priorAttempts = Number(rows[0]?.n ?? 0);
    await this.query(`INSERT INTO auth_attempts (id, bucket, created_at) VALUES ($1, $2, NOW())`, [
      createId("att"),
      bucket,
    ]);
    return priorAttempts;
  }

  async clearAttempts(bucket: string): Promise<void> {
    await this.query(`DELETE FROM auth_attempts WHERE bucket = $1`, [bucket]);
  }

  /** Housekeeping: rows that can no longer authorize anything. */
  async purgeExpired(): Promise<void> {
    await this.query(`DELETE FROM sessions WHERE expires_at < NOW()`);
    await this.query(`DELETE FROM password_reset_tokens WHERE expires_at < NOW()`);
    await this.query(`DELETE FROM auth_attempts WHERE created_at < NOW() - INTERVAL '1 day'`);
  }
}

function toUser(row: Record<string, any>): UserRecord {
  return {
    id: row.id,
    email: row.email,
    emailNormalized: row.email_normalized,
    passwordHash: row.password_hash,
    snapshotId: row.snapshot_id,
    createdAt: row.created_at,
  };
}

/** PostgreSQL SQLSTATE 23505 — unique_violation. */
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23505");
}
