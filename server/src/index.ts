// Load .env before anything reads process.env. Without this a .env file is
// simply ignored and DATABASE_URL is undefined, which surfaces as an unhelpful
// "DATABASE_URL missing" even though the file exists.
//
// The file is found by walking up from this module rather than from cwd: the
// npm scripts run with cwd=server/, and the compiled output sits at a
// different depth than the sources (server/dist/server/src vs server/src), so
// a fixed relative path is wrong in one of the two cases.
//
// On Vercel the platform injects real environment variables and there is no
// .env file, so finding none is not an error.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

function findEnvFile(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const envFile = findEnvFile();
// `quiet` suppresses dotenv's startup banner, which otherwise prints a
// promotional line above the server's own output on every boot.
if (envFile) loadEnv({ path: envFile, quiet: true });

import { closeDatabase, initializeDatabase } from "./db/index.js";
import { app } from "./app.js";

const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, async () => {
  console.log(`Budget API server running on http://${HOST}:${PORT}`);
  if (!process.env.DATABASE_URL) {
    console.warn(
      "DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string,\n" +
        "or run `npm run server:dev:pg` with LOCAL_PG_URL to use a local PostgreSQL instead.\n" +
        "The API will answer 503 until a database is configured.",
    );
  }
  try {
    await initializeDatabase();
    console.log("Database connected and schema up to date.");
  } catch (error) {
    console.error("Database initialization failed on startup:", error);
  }
});

function shutdown(signal: string) {
  console.log(`${signal} received, closing server...`);
  closeDatabase();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
export { server };
