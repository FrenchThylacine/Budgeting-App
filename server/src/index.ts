import express from "express";
import cors from "cors";
import { getDatabase, closeDatabase, initializeDatabase } from "./db/index";
import { createSnapshotRoutes } from "./routes/snapshot";
import { createSpendingRoutes } from "./routes/spending";
import { createCategoryRoutes } from "./routes/categories";
import { createActivitiesRoutes } from "./routes/activities";
import { createApprovalRoutes } from "./routes/approvals";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  }),
);

// DB Initialization middleware for serverless / local use
const dbInitMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    await initializeDatabase();
    next();
  } catch (error) {
    next(error);
  }
};

// Mount DB Init middleware for all API routes
app.use("/api", dbInitMiddleware);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Routes
app.use("/api/snapshot", createSnapshotRoutes());
app.use("/api/spending", createSpendingRoutes());
app.use("/api/categories", createCategoryRoutes());
app.use("/api/activities", createActivitiesRoutes());
app.use("/api/approvals", createApprovalRoutes());

// Error handling (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing server...");
  closeDatabase();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, closing server...");
  closeDatabase();
  process.exit(0);
});

const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, async () => {
  console.log(`Budget API server running on http://${HOST}:${PORT}`);
  try {
    await initializeDatabase();
    console.log("Neon database initialized successfully");
  } catch (error) {
    console.error("Neon database initialization failed on startup:", error);
  }
});

export default app;
export { server };
