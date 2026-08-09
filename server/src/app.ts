import express from "express";
import cors from "cors";
import { initializeDatabase } from "./db/index";
import { createSnapshotRoutes } from "./routes/snapshot";
import { createSpendingRoutes } from "./routes/spending";
import { createCategoryRoutes } from "./routes/categories";
import { createActivitiesRoutes } from "./routes/activities";
import { createApprovalRoutes } from "./routes/approvals";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));

  app.use("/api", async (_req, _res, next) => {
    try {
      await initializeDatabase();
      next();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/snapshot", createSnapshotRoutes());
  app.use("/api/spending", createSpendingRoutes());
  app.use("/api/categories", createCategoryRoutes());
  app.use("/api/activities", createActivitiesRoutes());
  app.use("/api/approvals", createApprovalRoutes());
  app.use(errorHandler);

  return app;
}

export const app = createApp();
