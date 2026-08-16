/**
 * Create an account directly in the database.
 *
 *   npx tsx scripts/create-account.ts                       # admin@admin.test / admin
 *   npx tsx scripts/create-account.ts you@example.com "a long passphrase"
 *
 * Why this exists rather than "just sign up in the browser":
 *
 *  - Bootstrapping. The first account on a fresh deployment has to come from
 *    somewhere, and if `SIGNUP_INVITE_CODE` is set you need a way in that does
 *    not depend on already being in.
 *  - Recovery. Resetting a password needs a working email provider. Without one
 *    configured, this is the way back into an account.
 *  - Local testing, which is what it is usually for.
 *
 * It is NOT a back door. The password goes through the same scrypt hashing as
 * every other account, and the row it writes is an ordinary account with no
 * elevated rights — this application has no roles. The only rule it relaxes is
 * the password-length minimum, and only against a local database (see below).
 */

import { Client } from "pg";
import { neon } from "@neondatabase/serverless";
import { AuthRepository, isPlausibleEmail, normalizeEmail } from "../server/src/auth/AuthRepository.js";
import { hashPassword, validatePassword } from "../server/src/auth/password.js";
import { setDatabase } from "../server/src/db/index.js";
import { initializeSchema } from "../server/src/db/schema.js";
import { runMigrations } from "../server/src/migrations/index.js";

const DEFAULT_EMAIL = "admin@admin.test";
const DEFAULT_PASSWORD = "admin";

function connectionString(): string {
  for (const name of [
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "DATABASE_URL_UNPOOLED",
    "POSTGRES_URL_NON_POOLING",
  ]) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  throw new Error("No connection string. Set DATABASE_URL (see .env.example).");
}

/**
 * Whether the target is a database on this machine.
 *
 * This decides whether the password-length rule may be relaxed. A throwaway
 * local database is a fine place for `admin`/`admin`; a deployed one holding
 * real financial records is not, and a guessable password there is a far bigger
 * hole than anything the login form protects against.
 */
function isLocalDatabase(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * node-postgres presented with the Neon driver's call shape.
 *
 * The Neon serverless driver speaks HTTP to Neon's endpoint, so it cannot talk
 * to a plain PostgreSQL server. Local runs need this adapter; deployed ones use
 * the real driver.
 */
function pgAdapter(client: Client) {
  const sql: any = (strings: TemplateStringsArray, ...params: unknown[]) => {
    let text = "";
    strings.forEach((part, i) => {
      text += part;
      if (i < params.length) text += `$${i + 1}`;
    });
    return {
      __query: { text, values: params },
      then: (resolve: any, reject: any) =>
        client.query(text, params).then((r) => r.rows).then(resolve, reject),
    };
  };
  sql.transaction = async (queries: any[]) => {
    await client.query("BEGIN");
    try {
      const out = [];
      for (const q of queries) out.push((await client.query(q.__query.text, q.__query.values)).rows);
      await client.query("COMMIT");
      return out;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  };
  return sql;
}

async function main(): Promise<void> {
  const email = process.argv[2] ?? DEFAULT_EMAIL;
  const password = process.argv[3] ?? DEFAULT_PASSWORD;

  const url = connectionString();
  const local = isLocalDatabase(url);

  if (!isPlausibleEmail(email)) {
    throw new Error(`"${email}" is not an email address. It needs an @ — try ${DEFAULT_EMAIL}.`);
  }

  const problem = validatePassword(password);
  if (problem) {
    if (!local) {
      throw new Error(
        `${problem}\n\n` +
          `The target database is not on this machine, so the rule stands. A guessable\n` +
          `password on a deployed budget is a far bigger hole than anything the sign-in\n` +
          `form protects against. Pick a longer one, or point DATABASE_URL at a local\n` +
          `database for testing.`,
      );
    }
    console.warn(`⚠️  ${problem}`);
    console.warn("   Allowed here only because the database is local. Never do this on a deployment.\n");
  }

  let client: Client | null = null;
  if (local) {
    client = new Client({ connectionString: url });
    await client.connect();
    setDatabase(pgAdapter(client));
  } else {
    setDatabase(neon(url) as never);
    console.log("⚠️  Target is a REMOTE database. This creates a real account.\n");
  }

  try {
    // Safe to re-run: every statement is written with IF NOT EXISTS, and the
    // migration bookkeeping is idempotent.
    const sql = (await import("../server/src/db/index.js")).getDatabase();
    await initializeSchema(sql as never);
    await runMigrations(sql as never);

    const repo = new AuthRepository();

    const existing = await repo.findUserByEmail(email);
    if (existing) {
      // Reset rather than fail: recovering an account you are locked out of is
      // half the reason this script exists.
      await repo.updatePassword(existing.id, await hashPassword(password), new Date().toISOString());
      // Any session opened with the old password must not survive it.
      await repo.deleteAllSessionsForUser(existing.id);
      console.log(`✅ Password updated for ${existing.email}`);
      console.log(`   Budget: ${existing.snapshotId}`);
      console.log(`   All existing sessions for this account were signed out.`);
      return;
    }

    const snapshotId = await repo.snapshotIdForNewUser();
    const user = await repo.createUser(email, await hashPassword(password), snapshotId, new Date().toISOString());
    if (!user) throw new Error("That email was taken between the check and the insert. Run it again.");

    console.log(`✅ Account created`);
    console.log(`   Email:    ${user.email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Budget:   ${snapshotId}${snapshotId === "active" ? "  (adopted the pre-existing budget)" : ""}`);
  } finally {
    await client?.end();
  }
}

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
