import express from "express";
import cors from "cors";
import { getDatabase, closeDatabase } from "./db/index";
import { createSnapshotRoutes } from "./routes/snapshot";
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

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Routes
app.use("/api/snapshot", createSnapshotRoutes());

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

const server = app.listen(PORT, HOST, () => {
  console.log(`Budget API server running on http://${HOST}:${PORT}`);
  console.log(`Database: ${process.env.DB_PATH || "data/budget.db"}`);
});

export default app;
export { server };
