import express from "express";
import cors from "cors";
import { initializeDatabase } from "./db/index.js";
import { createSnapshotRoutes } from "./routes/snapshot.js";
import { createSpendingRoutes } from "./routes/spending.js";
import { createCategoryRoutes } from "./routes/categories.js";
import { createActivitiesRoutes } from "./routes/activities.js";
import { createApprovalRoutes } from "./routes/approvals.js";
import { AppError, errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));

  // Health must answer even when the database is unreachable, so operators can
  // tell "server down" apart from "server up, database misconfigured".
  app.get("/api/health", async (_req, res) => {
    try {
      await initializeDatabase();
      res.json({ status: "ok", database: "connected" });
    } catch (error) {
      res.status(503).json({
        status: "degraded",
        database: "unavailable",
        message: error instanceof Error ? error.message : String(error),
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
  app.use("/api/snapshot", createSnapshotRoutes());
  app.use("/api/spending", createSpendingRoutes());
  app.use("/api/categories", createCategoryRoutes());
  app.use("/api/activities", createActivitiesRoutes());
  app.use("/api/approvals", createApprovalRoutes());
  app.use(errorHandler);

  return app;
}

export const app = createApp();
