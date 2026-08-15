/**
 * Run the real API server against a standard local PostgreSQL database.
 *
 * The production driver (@neondatabase/serverless) speaks HTTP to Neon and
 * cannot target a local server, which otherwise makes it impossible to develop
 * or test the backend without a Neon account. This launcher injects a
 * node-postgres adapter exposing the same interface the repository uses
 * (tagged template + `transaction([...])`) through `setDatabase`, so every
 * route, service, and repository runs exactly as it does in production.
 *
 * Usage:
 *   LOCAL_PG_URL=postgres://postgres@127.0.0.1:5432/budget node scripts/dev-server-local-pg.mjs
 *
 * Optional: PORT (default 3001), PG_SCHEMA (default public).
 */

import { Client } from "pg";
import { setDatabase } from "../server/src/db/index.js";
import { createApp } from "../server/src/app.js";

const connectionString = process.env.LOCAL_PG_URL;
if (!connectionString) {
  console.error("LOCAL_PG_URL is required, e.g. postgres://postgres@127.0.0.1:5432/budget");
  process.exit(1);
}

const port = Number(process.env.PORT || 3001);
const schema = process.env.PG_SCHEMA || "public";

const client = new Client({ connectionString });
await client.connect();
await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
await client.query(`SET search_path TO ${schema}`);

/** Adapt node-postgres to the driver interface the repository expects. */
function pgTagAdapter(pgClient) {
  const sql = (strings, ...params) => {
    let text = "";
    strings.forEach((part, i) => {
      text += part;
      if (i < params.length) text += `$${i + 1}`;
    });
    return {
      __query: { text, values: params },
      then: (resolve, reject) =>
        pgClient.query(text, params).then((r) => r.rows).then(resolve, reject),
    };
  };

  sql.transaction = async (queries) => {
    await pgClient.query("BEGIN");
    try {
      const results = [];
      for (const q of queries) {
        results.push((await pgClient.query(q.__query.text, q.__query.values)).rows);
      }
      await pgClient.query("COMMIT");
      return results;
    } catch (error) {
      await pgClient.query("ROLLBACK");
      throw error;
    }
  };

  return sql;
}

setDatabase(pgTagAdapter(client));

const server = createApp().listen(port, "0.0.0.0", () => {
  console.log(`API server (local PostgreSQL, schema "${schema}") on http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(async () => {
      await client.end();
      process.exit(0);
    });
  });
}
