import type { SqlDriver } from "./index.js";

/*
 * There was a `NeonSql` alias here, exported and never used to annotate
 * anything — and when it was finally applied to the one function it was
 * plainly written for, the build rejected every call site: the callers pass
 * `SqlDriver`, the structural type this codebase actually speaks, which the
 * tests can substitute a plain PostgreSQL client for. A type that describes a
 * contract nothing in the project honours is worse than no type at all, so the
 * real one is used below and the alias is gone.
 */

/**
 * Execute a parameterized SQL query using the Neon driver.
 * Converts sql(queryString, params[]) into the proper tagged template call.
 */
export async function query(
  sql: SqlDriver,
  queryString: string,
  params: unknown[] = [],
): Promise<Record<string, any>[]> {
  // Build a TemplateStringsArray-like object from the query with $1, $2, ... placeholders
  const parts = queryString.split(/\$\d+/);
  // Create the template strings array
  const strings = Object.assign([...parts], { raw: [...parts] }) as unknown as TemplateStringsArray;
  const result = await (sql as any)(strings, ...params);
  return result as Record<string, any>[];
}
