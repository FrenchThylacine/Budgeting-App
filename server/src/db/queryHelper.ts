import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Wrapper around Neon's tagged-template sql function that also supports
 * parameterized queries via a helper method.
 */
export type NeonSql = NeonQueryFunction<false, false>;

/**
 * Execute a parameterized SQL query using the Neon driver.
 * Converts sql(queryString, params[]) into the proper tagged template call.
 */
export async function query(sql: any, queryString: string, params: unknown[] = []): Promise<Record<string, any>[]> {
  // Build a TemplateStringsArray-like object from the query with $1, $2, ... placeholders
  const parts = queryString.split(/\$\d+/);
  // Create the template strings array
  const strings = Object.assign([...parts], { raw: [...parts] }) as unknown as TemplateStringsArray;
  const result = await (sql as any)(strings, ...params);
  return result as Record<string, any>[];
}
