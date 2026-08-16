import express from "express";
import cors from "cors";
import { connectionStringSources, initializeDatabase } from "./db/index.js";
import { createSnapshotRoutes } from "./routes/snapshot.js";
import { createSpendingRoutes } from "./routes/spending.js";
import { createCategoryRoutes } from "./routes/categories.js";
import { createActivitiesRoutes } from "./routes/activities.js";
import { createApprovalRoutes } from "./routes/approvals.js";
import { createAuthRoutes } from "./routes/auth.js";
import { attachAuth, requireAuth } from "./auth/middleware.js";
import { AppError, errorHandler } from "./middleware/errorHandler.js";

/**
 * Which browser origins may call this API with credentials.
 *
 * `cors({ origin: "*", credentials: true })` — what this used to be — is a
 * combination browsers reject outright: a wildcard
 * `Access-Control-Allow-Origin` is never honoured alongside
 * `Access-Control-Allow-Credentials`, so the session cookie would simply never
 * be sent. An allowlist is therefore required, not merely preferable.
 */
function corsOptions(): cors.CorsOptions {
  const configured = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value !== "*");

  // Local development ports, always allowed: they cannot be reached from
  // anywhere but the developer's own machine.
  const allowed = new Set([
    ...configured,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
  ]);

  return {
    credentials: true,
    origin(origin, callback) {
      // No Origin header: same-origin navigation, curl, or a server-to-server
      // call. There is no cross-site risk to guard against, and rejecting these
      // would break the deployment where the API and the app share a domain.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowed.has(origin)) {
        callback(null, true);
        return;
      }
      // Vercel preview deployments get a generated subdomain per commit, so
      // they cannot be listed ahead of time. Opt in explicitly.
      if (process.env.CORS_ALLOW_VERCEL_PREVIEWS === "true" && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  };
}

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "10mb" }));
  app.use(cors(corsOptions()));

  // Health must answer even when the database is unreachable, so operators can
  // tell "server down" apart from "server up, database misconfigured". It is
  // mounted before the database gate and before authentication for that reason.
  app.get("/api/health", async (_req, res) => {
    try {
      await initializeDatabase();
      res.json({ status: "ok", database: "connected" });
    } catch (error) {
      // When the database is unreachable, report WHICH of the known connection
      // variables are present. Names and booleans only — never a value, and
      // never arbitrary environment keys, so this cannot leak a secret. It
      // exists because "DATABASE_URL missing" on a platform you cannot inspect
      // is otherwise indistinguishable from "set, but in the wrong scope".
      res.status(503).json({
        status: "degraded",
        database: "unavailable",
        message: error instanceof Error ? error.message : String(error),
        connectionStringVars: connectionStringSources(),
        runtime: { nodeEnv: process.env.NODE_ENV ?? null, onVercel: Boolean(process.env.VERCEL) },
      });
    }
  });

  app.use("/api", async (_req, _res, next) => {
    try {
      await initializeDatabase();
      next();
    } catch (error) {
      next(
        new AppError(
          503,
          `Database unavailable: ${error instanceof Error ? error.message : String(error)}. Set DATABASE_URL to a Neon connection string.`,
        ),
      );
    }
  });

  // Resolve the session for every request, but require it only below. The auth
  // routes need to know who is calling (`/me`, `/change-password`) while
  // remaining reachable when nobody is signed in.
  app.use("/api", attachAuth);
  app.use("/api/auth", createAuthRoutes());

  // Everything past this line is account data. `requireAuth` is applied once,
  // here, rather than route by route — a per-route guard is one forgotten line
  // away from exposing a budget.
  app.use("/api", requireAuth);

  app.use("/api/snapshot", createSnapshotRoutes());
  app.use("/api/spending", createSpendingRoutes());
  app.use("/api/categories", createCategoryRoutes());
  app.use("/api/activities", createActivitiesRoutes());
  app.use("/api/approvals", createApprovalRoutes());
  app.use(errorHandler);

  return app;
}

export const app = createApp();
